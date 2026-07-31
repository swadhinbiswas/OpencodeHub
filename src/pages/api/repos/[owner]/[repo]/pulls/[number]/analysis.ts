/**
 * PR Analysis API Endpoint
 * Triggers and retrieves AI-powered code review analysis.
 */

import type { APIRoute } from "astro";
import { eq, and, desc } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { generateId } from "@/lib/utils";
import { runAnalysisPipeline } from "@/lib/review/pipeline";
import { generateAISummaries, generateFallbackSummaries } from "@/lib/review/summarizer";
import { buildFullReviewPrompt } from "@/lib/review/prompts";
import { parseAIConfigFromStorage } from "@/lib/ai-config";
import { getAIAdapter } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { existsSync } from "fs";

export const GET: APIRoute = withErrorHandler(async ({ params }) => {
  const { owner, repo, number } = params!;
  const prNumber = parseInt(number!);

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, owner!),
  });

  if (!user) {
    return new Response(JSON.stringify({ error: { message: "User not found" } }), { status: 404 });
  }

  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.name, repo!),
      eq(schema.repositories.ownerId, user.id),
    ),
  });

  if (!repository) {
    return new Response(JSON.stringify({ error: { message: "Repository not found" } }), { status: 404 });
  }

  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(schema.pullRequests.repositoryId, repository.id),
      eq(schema.pullRequests.number, prNumber),
    ),
  });

  if (!pr) {
    return new Response(JSON.stringify({ error: { message: "Pull request not found" } }), { status: 404 });
  }

  const analysis = await db.query.prReviewAnalyses.findFirst({
    where: eq(schema.prReviewAnalyses.pullRequestId, pr.id),
    orderBy: [desc(schema.prReviewAnalyses.createdAt)],
  });

  if (!analysis) {
    return new Response(JSON.stringify({ data: null }), { status: 200 });
  }

  const inlineComments = await db.query.aiInlineComments.findMany({
    where: eq(schema.aiInlineComments.analysisId, analysis.id),
    orderBy: [schema.aiInlineComments.filePath, schema.aiInlineComments.line],
  });

  return new Response(JSON.stringify({
    data: {
      analysis: {
        id: analysis.id,
        status: analysis.status,
        healthScore: analysis.healthScore,
        healthGrade: analysis.healthGrade,
        blastRadius: analysis.blastRadius,
        architectureImpact: analysis.architectureImpact,
        changeGroups: analysis.changeGroups,
        complexityData: analysis.complexityData,
        summaries: analysis.summaries,
        filesAnalyzed: analysis.filesAnalyzed,
        totalAdditions: analysis.totalAdditions,
        totalDeletions: analysis.totalDeletions,
        model: analysis.model,
        provider: analysis.provider,
        tokensUsed: analysis.tokensUsed,
        errorMessage: analysis.errorMessage,
        createdAt: analysis.createdAt,
        completedAt: analysis.completedAt,
      },
      inlineComments: inlineComments.map((c: any) => ({
        id: c.id,
        filePath: c.filePath,
        line: c.line,
        endLine: c.endLine,
        severity: c.severity,
        type: c.type,
        category: c.category,
        title: c.title,
        message: c.message,
        suggestedFix: c.suggestedFix,
        explanation: c.explanation,
        confidence: c.confidence,
        isResolved: c.isResolved,
        isApplied: c.isApplied,
      })),
    },
  }), { status: 200 });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo, number } = params!;
  const prNumber = parseInt(number!);

  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return new Response(JSON.stringify({ error: { message: "Authentication required" } }), { status: 401 });
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, owner!),
  });

  if (!user) {
    return new Response(JSON.stringify({ error: { message: "User not found" } }), { status: 404 });
  }

  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.name, repo!),
      eq(schema.repositories.ownerId, user.id),
    ),
  });

  if (!repository) {
    return new Response(JSON.stringify({ error: { message: "Repository not found" } }), { status: 404 });
  }

  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(schema.pullRequests.repositoryId, repository.id),
      eq(schema.pullRequests.number, prNumber),
    ),
  });

  if (!pr) {
    return new Response(JSON.stringify({ error: { message: "Pull request not found" } }), { status: 404 });
  }

  // Check if analysis is already running
  const existingRunning = await db.query.prReviewAnalyses.findFirst({
    where: and(
      eq(schema.prReviewAnalyses.pullRequestId, pr.id),
      eq(schema.prReviewAnalyses.status, "running"),
    ),
  });

  if (existingRunning) {
    return new Response(JSON.stringify({
      data: { id: existingRunning.id, status: "running" },
      message: "Analysis already in progress",
    }), { status: 200 });
  }

  // Create analysis record
  const analysisId = generateId();
  await db.insert(schema.prReviewAnalyses).values({
    id: analysisId,
    pullRequestId: pr.id,
    repositoryId: repository.id,
    status: "running",
    baseSha: pr.baseSha,
    headSha: pr.headSha,
    triggeredById: tokenPayload.userId,
  });

  // Run analysis asynchronously
  const repoPath = repository.diskPath;
  runAnalysisAsync(analysisId, repoPath, pr.baseSha, pr.headSha, {
    prTitle: pr.title,
    prBody: pr.body || "",
    repoName: repo!,
    owner: owner!,
    branch: pr.headBranch,
    filesChanged: pr.changedFiles || 0,
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
  }).catch((err: any) => {
    logger.error({ err, analysisId }, "Analysis pipeline failed");
  });

  return new Response(JSON.stringify({
    data: { id: analysisId, status: "running" },
    message: "Analysis started",
  }), { status: 202 });
});

async function runAnalysisAsync(
  analysisId: string,
  repoPath: string,
  baseSha: string,
  headSha: string,
  options: {
    prTitle: string;
    prBody: string;
    repoName: string;
    owner: string;
    branch: string;
    filesChanged: number;
    additions: number;
    deletions: number;
  },
) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  try {
    if (!existsSync(repoPath)) {
      throw new Error(`Repository path not found: ${repoPath}`);
    }

    const analysis = await runAnalysisPipeline(repoPath, baseSha, headSha);

    // Generate summaries
    let summaries;
    try {
      const aiConfig = parseAIConfigFromStorage(undefined as any);
      if (aiConfig?.apiKeys) {
        summaries = await generateAISummaries(analysis, options, aiConfig);
      } else {
        summaries = generateFallbackSummaries(analysis, options);
      }
    } catch {
      summaries = generateFallbackSummaries(analysis, options);
    }

    // Generate AI review suggestions
    let aiSuggestions: any[] = [];
    let rawAiResponse: any = null;
    let tokensUsed = 0;

    try {
      const aiConfig = parseAIConfigFromStorage(undefined as any);
      if (aiConfig?.apiKeys && aiConfig.provider) {
        const apiKey = (aiConfig.apiKeys as any)[aiConfig.provider];
        if (apiKey) {
          const adapter = getAIAdapter(aiConfig.provider as any);
          const diffContent = analysis.chunks.map((c: any) => c.content).join("\n\n").slice(0, 50000);
          const prompt = buildFullReviewPrompt(analysis, options, diffContent);

          const result = await adapter.complete(
            { system: "You are an expert code reviewer. Always respond with valid JSON only, no markdown fences.", user: prompt },
            { provider: aiConfig.provider as any, model: aiConfig.model, apiKey },
          );

          rawAiResponse = result;
          tokensUsed = result.usage?.totalTokens || 0;

          const parsed = parseJSONResponse(result.content);
          if (parsed?.suggestions) {
            aiSuggestions = parsed.suggestions;
          }
        }
      }
    } catch (err) {
      logger.warn({ err, analysisId }, "AI review generation failed, continuing with analysis only");
    }

    // Update analysis record
    await db.update(schema.prReviewAnalyses).set({
      status: "completed",
      complexityData: analysis.complexity.aggregate as any,
      dependencyGraph: analysis.depGraph as any,
      architectureImpact: analysis.archImpact as any,
      changeGroups: analysis.groups as any,
      blastRadius: analysis.blastRadius as any,
      healthScore: analysis.healthScore.score,
      healthGrade: analysis.healthScore.grade,
      summaries: summaries as any,
      filesAnalyzed: analysis.chunks.length,
      chunksProcessed: analysis.chunks.length,
      totalAdditions: analysis.stats.totalAdditions,
      totalDeletions: analysis.stats.totalDeletions,
      tokensUsed,
      rawAiResponse,
      completedAt: new Date(),
    }).where(eq(schema.prReviewAnalyses.id, analysisId));

    // Get the pull request ID from the analysis record
    const analysisRecord = await db.query.prReviewAnalyses.findFirst({
      where: eq(schema.prReviewAnalyses.id, analysisId),
    });

    // Insert inline comments
    for (const suggestion of aiSuggestions) {
      if (suggestion.path && suggestion.line) {
        await db.insert(schema.aiInlineComments).values({
          id: generateId(),
          analysisId,
          pullRequestId: analysisRecord?.pullRequestId || "",
          filePath: suggestion.path,
          line: suggestion.line,
          severity: suggestion.severity || "info",
          type: suggestion.type || "suggestion",
          category: suggestion.category || "code-quality",
          title: suggestion.title || "Review suggestion",
          message: suggestion.message || "",
          suggestedFix: suggestion.suggestedFix,
          explanation: suggestion.explanation,
          confidence: Math.round((suggestion.confidence || 0.5) * 100),
        });
      }
    }

    logger.info({ analysisId, filesAnalyzed: analysis.chunks.length }, "Analysis completed successfully");
  } catch (err) {
    logger.error({ err, analysisId }, "Analysis failed");

    await db.update(schema.prReviewAnalyses).set({
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
      completedAt: new Date(),
    }).where(eq(schema.prReviewAnalyses.id, analysisId));
  }
}

function parseJSONResponse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch {}
    }
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch {}
    }
    return null;
  }
}
