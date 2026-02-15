/**
 * AI Code Review Library
 * LLM-powered code review with stack context and inline suggestions
 */

import { eq, and, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { logger } from "@/lib/logger";
import { generateId } from "./utils";
import { getStackForPr } from "./stacks";
import { acquireRepo, releaseRepo } from "./git-storage";
import { simpleGit } from "simple-git";
import OpenAI from "openai";

// Supported AI providers
// Supported AI providers
export type AIProvider = "openai" | "anthropic" | "groq" | "bytez" | "local";
export type AIModel = string; // Allow any string for model flexibility

export interface AIReviewConfig {
    provider: AIProvider;
    model: AIModel;
    apiKey?: string;
    baseUrl?: string; // For local models
    includeStackContext?: boolean;
}

export interface ReviewSuggestion {
    path: string;
    line?: number;
    endLine?: number;
    severity: "info" | "warning" | "error" | "critical";
    type: "bug" | "security" | "performance" | "style" | "documentation" | "suggestion";
    title: string;
    message: string;
    suggestedFix?: string;
    explanation?: string;
}

export interface AIReviewResult {
    reviewId: string;
    summary: string;
    overallSeverity: "info" | "warning" | "error" | "critical";
    suggestions: ReviewSuggestion[];
    tokensUsed: number;
}

/**
 * Trigger an AI review for a pull request
 */
export async function triggerAIReview(
    pullRequestId: string,
    triggeredById: string,
    config: AIReviewConfig
): Promise<typeof schema.aiReviews.$inferSelect> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Create review record
    const reviewId = generateId();
    const review = {
        id: reviewId,
        pullRequestId,
        status: "pending",
        model: config.model,
        provider: config.provider,
        includesStackContext: config.includeStackContext || false,
        triggeredById,
        createdAt: new Date(),
    };

    await db.insert(schema.aiReviews).values(review);

    // Start the review asynchronously
    // In production, this would be queued to a background job
    runAIReview(reviewId, pullRequestId, config).catch(console.error);

    return review as typeof schema.aiReviews.$inferSelect;
}

/**
 * Run the AI review (called asynchronously)
 */
async function runAIReview(
    reviewId: string,
    pullRequestId: string,
    config: AIReviewConfig
): Promise<void> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    try {
        // Mark as running
        await db.update(schema.aiReviews)
            .set({ status: "running", startedAt: new Date() })
            .where(eq(schema.aiReviews.id, reviewId));

        // Get PR and diff
        const pr = await db.query.pullRequests.findFirst({
            where: eq(schema.pullRequests.id, pullRequestId),
            with: {
                repository: {
                    with: { owner: true }
                }
            }
        });

        if (!pr) {
            throw new Error("PR not found");
        }

        // Fetch Diff
        let diff = "";
        try {
            const repoPath = await acquireRepo(pr.repository.owner.username, pr.repository.name);
            const git = simpleGit(repoPath);
            await git.fetch();
            // Get diff between base and head
            // Ideally we want the merge base to head
            const mergeBase = await git.raw(["merge-base", `origin/${pr.baseBranch}`, `origin/${pr.headBranch}`]);
            diff = await git.diff([mergeBase.trim(), `origin/${pr.headBranch}`]);
            await releaseRepo(pr.repository.owner.username, pr.repository.name, false);
        } catch (e) {
            logger.error("Failed to fetch diff for AI review", e);
            throw new Error("Could not fetch diff from git");
        }

        if (!diff) {
            diff = "No changes detected.";
        }

        // Truncate diff if too large (poor man's token limit)
        if (diff.length > 50000) {
            diff = diff.substring(0, 50000) + "\n\n...[Diff truncated due to length]...";
        }

        // Get stack context if enabled
        let stackContext = null;
        if (config.includeStackContext) {
            const stackInfo = await getStackForPr(pullRequestId);
            if (stackInfo) {
                stackContext = JSON.stringify({
                    stackName: stackInfo.stack.name,
                    baseBranch: stackInfo.stack.baseBranch,
                    prsInStack: stackInfo.entries.map(e => ({
                        number: e.pr.number,
                        title: e.pr.title,
                        state: e.pr.state,
                    })),
                });
            }
        }

        // Generate review prompt
        const prompt = generateReviewPrompt(pr, stackContext, diff);

        // Call AI provider
        const result = await callAIProvider(config, prompt);

        // Parse and save suggestions
        const suggestions = parseAIResponse(result.content);

        for (const suggestion of suggestions) {
            await db.insert(schema.aiReviewSuggestions).values({
                id: generateId(),
                aiReviewId: reviewId,
                path: suggestion.path,
                line: suggestion.line,
                endLine: suggestion.endLine,
                severity: suggestion.severity,
                type: suggestion.type,
                title: suggestion.title,
                message: suggestion.message,
                suggestedFix: suggestion.suggestedFix,
                explanation: suggestion.explanation,
                createdAt: new Date(),
            });
        }

        // Determine overall severity
        const severityOrder: Array<"info" | "warning" | "error" | "critical"> = ["info", "warning", "error", "critical"];
        let maxSeverity: "info" | "warning" | "error" | "critical" = "info";
        for (const s of suggestions) {
            if (severityOrder.indexOf(s.severity) > severityOrder.indexOf(maxSeverity)) {
                maxSeverity = s.severity;
            }
        }

        // Update review with results
        await db.update(schema.aiReviews)
            .set({
                status: "completed",
                summary: result.summary,
                overallSeverity: maxSeverity,
                suggestionsCount: suggestions.length,
                tokensUsed: result.tokensUsed,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                stackContext,
                completedAt: new Date(),
            })
            .where(eq(schema.aiReviews.id, reviewId));

    } catch (error) {
        console.error("AI review failed:", error);
        await db.update(schema.aiReviews)
            .set({
                status: "failed",
                errorMessage: error instanceof Error ? error.message : "Unknown error",
                completedAt: new Date(),
            })
            .where(eq(schema.aiReviews.id, reviewId));
    }
}

/**
 * Generate the review prompt
 */
function generateReviewPrompt(
    pr: typeof schema.pullRequests.$inferSelect,
    stackContext: string | null,
    diff: string
): string {
    let prompt = `You are a senior code reviewer. Review the following pull request and provide actionable feedback.

## Pull Request
- Title: ${pr.title}
- Description: ${pr.body || "No description"}
- Branch: ${pr.headBranch} → ${pr.baseBranch}
- Changes: +${pr.additions} -${pr.deletions} in ${pr.changedFiles} files
`;

    if (stackContext) {
        prompt += `
## Stack Context
This PR is part of a stack:
${stackContext}
`;
    }

    prompt += `
## Review Instructions
1. Identify bugs, security issues, performance problems, and style issues
2. For each issue, provide:
   - File path and line number (if applicable)
   - Severity: info, warning, error, or critical
   - Type: bug, security, performance, style, documentation, or suggestion
   - Clear explanation
   - Suggested fix (code snippet if applicable)
3. Provide a brief summary at the end

## Response Format
Respond in JSON format only:
{
  "summary": "Brief overall assessment",
  "suggestions": [
    {
      "path": "src/example.ts",
      "line": 42,
      "severity": "warning",
      "type": "bug",
      "title": "Potential null pointer",
      "message": "Variable may be null here",
      "suggestedFix": "if (value !== null) { ... }",
      "explanation": "This could cause a runtime error"
    }
  ]
}

Review the code carefully:

## Diff
${diff}
`;

    return prompt;
}

/**
 * Call the AI provider
 */
/**
 * Call the AI provider
 */
async function callAIProvider(
    config: AIReviewConfig,
    prompt: string
): Promise<{
    content: string;
    summary: string;
    tokensUsed: number;
    promptTokens: number;
    completionTokens: number;
}> {

    // Import dynamically to avoid circular dependencies if any
    const { getAIAdapter } = await import("./ai");

    try {
        const adapter = getAIAdapter(config.provider);

        // Construct system/user prompt split
        // For now, we'll extract the system instruction manually or just pass it as system
        // The generateReviewPrompt function returns a single string. 
        // We should ideally refactor generateReviewPrompt, but for now let's split it or pass as user.
        // Actually, the current generateReviewPrompt returns a single massive string.
        // let's just use a generic system prompt and the full prompt as user.

        const systemPrompt = "You are an expert code reviewer. Response MUST be valid JSON matching the requested format.";

        const result = await adapter.complete({
            system: systemPrompt,
            user: prompt
        }, {
            provider: config.provider,
            model: config.model,
            apiKey: config.apiKey,
            baseUrl: config.baseUrl
        });

        // Parse summary from content
        let summary = "AI Review Completed";
        try {
            const parsed = JSON.parse(result.content);
            if (parsed.summary) summary = parsed.summary;
        } catch (e) { }

        return {
            content: result.content,
            summary,
            tokensUsed: result.usage.totalTokens,
            promptTokens: result.usage.inputTokens,
            completionTokens: result.usage.outputTokens,
        };

    } catch (error: any) {
        logger.error({ error: error.message, provider: config.provider }, "AI Provider call failed");

        // Fallback or rethrow? Rethrow to fail the review properly.
        throw error;
    }
}

/**
 * Parse AI response into suggestions
 */
function parseAIResponse(content: string): ReviewSuggestion[] {
    try {
        const parsed = JSON.parse(content);
        return parsed.suggestions || [];
    } catch {
        console.error("Failed to parse AI response:", content);
        return [];
    }
}

/**
 * Get the latest AI review for a PR
 */
export async function getLatestAIReview(pullRequestId: string): Promise<{
    review: typeof schema.aiReviews.$inferSelect;
    suggestions: typeof schema.aiReviewSuggestions.$inferSelect[];
} | null> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const review = await db.query.aiReviews.findFirst({
        where: eq(schema.aiReviews.pullRequestId, pullRequestId),
        orderBy: [desc(schema.aiReviews.createdAt)],
    });

    if (!review) return null;

    const suggestions = await db.query.aiReviewSuggestions.findMany({
        where: eq(schema.aiReviewSuggestions.aiReviewId, review.id),
    });

    return { review, suggestions };
}

/**
 * Apply an AI suggestion (mark as applied)
 */
export async function applyAISuggestion(
    suggestionId: string,
    appliedById: string
): Promise<void> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    await db.update(schema.aiReviewSuggestions)
        .set({
            isApplied: true,
            appliedAt: new Date(),
            appliedById,
        })
        .where(eq(schema.aiReviewSuggestions.id, suggestionId));
}

/**
 * Dismiss an AI suggestion
 */
export async function dismissAISuggestion(
    suggestionId: string,
    dismissedById: string,
    reason?: string
): Promise<void> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    await db.update(schema.aiReviewSuggestions)
        .set({
            isDismissed: true,
            dismissedAt: new Date(),
            dismissedById,
            dismissReason: reason,
        })
        .where(eq(schema.aiReviewSuggestions.id, suggestionId));
}
