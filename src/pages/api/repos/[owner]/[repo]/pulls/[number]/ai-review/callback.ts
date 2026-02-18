import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { generateId } from "@/lib/utils";

const callbackSchema = z.object({
  reviewId: z.string().min(1),
  status: z.enum(["completed", "failed"]).default("completed"),
  summary: z.string().optional(),
  overallSeverity: z.enum(["info", "warning", "error", "critical"]).optional(),
  suggestions: z
    .array(
      z.object({
        path: z.string().min(1),
        line: z.number().int().positive().optional(),
        endLine: z.number().int().positive().optional(),
        severity: z.enum(["info", "warning", "error", "critical"]).default("warning"),
        type: z
          .enum(["bug", "security", "performance", "style", "documentation", "suggestion"])
          .default("suggestion"),
        title: z.string().min(1),
        message: z.string().min(1),
        suggestedFix: z.string().optional(),
        explanation: z.string().optional(),
      })
    )
    .optional(),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
      totalTokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
  rawResponse: z.unknown().optional(),
});

function isAuthorized(request: Request): boolean {
  const expected =
    process.env.EXTERNAL_AGENT_CALLBACK_SECRET || process.env.INTERNAL_HOOK_SECRET;
  if (!expected) return false;
  return request.headers.get("Authorization") === `Bearer ${expected}`;
}

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const { owner, repo: repoName, number } = params;
  const prNumber = Number.parseInt(number || "", 10);
  if (!owner || !repoName || Number.isNaN(prNumber)) {
    return badRequest("Invalid repository or pull request");
  }

  const parsed = callbackSchema.safeParse(await request.json());
  if (!parsed.success) {
    return badRequest("Invalid callback payload");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
    columns: { id: true },
  });
  if (!ownerUser) return notFound("Repository owner not found");

  const repository = await db.query.repositories.findFirst({
    where: and(eq(schema.repositories.ownerId, ownerUser.id), eq(schema.repositories.name, repoName)),
    columns: { id: true },
  });
  if (!repository) return notFound("Repository not found");

  const pr = await db.query.pullRequests.findFirst({
    where: and(eq(schema.pullRequests.repositoryId, repository.id), eq(schema.pullRequests.number, prNumber)),
    columns: { id: true },
  });
  if (!pr) return notFound("Pull request not found");

  const review = await db.query.aiReviews.findFirst({
    where: and(eq(schema.aiReviews.id, parsed.data.reviewId), eq(schema.aiReviews.pullRequestId, pr.id)),
  });
  if (!review) return notFound("AI review run not found");

  if (parsed.data.status === "failed") {
    await db
      .update(schema.aiReviews)
      .set({
        status: "failed",
        errorMessage: parsed.data.errorMessage || "External agent reported failure",
        completedAt: new Date(),
      })
      .where(eq(schema.aiReviews.id, review.id));
    return success({ reviewId: review.id, status: "failed" });
  }

  // Replace findings with latest callback result.
  await db
    .delete(schema.aiReviewSuggestions)
    .where(eq(schema.aiReviewSuggestions.aiReviewId, review.id));

  const suggestions = parsed.data.suggestions || [];
  for (const suggestion of suggestions) {
    await db.insert(schema.aiReviewSuggestions).values({
      id: generateId(),
      aiReviewId: review.id,
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

  const usage = parsed.data.usage;
  const inputTokens = usage?.inputTokens ?? parsed.data.promptTokens;
  const outputTokens = usage?.outputTokens ?? parsed.data.completionTokens;
  const totalTokens =
    usage?.totalTokens ??
    parsed.data.tokensUsed ??
    ((inputTokens || 0) + (outputTokens || 0));

  await db
    .update(schema.aiReviews)
    .set({
      status: "completed",
      summary: parsed.data.summary || review.summary || "External agent review completed",
      overallSeverity: parsed.data.overallSeverity || "info",
      suggestionsCount: suggestions.length,
      tokensUsed: totalTokens || 0,
      promptTokens: inputTokens || 0,
      completionTokens: outputTokens || 0,
      rawResponse:
        parsed.data.rawResponse !== undefined
          ? JSON.stringify(parsed.data.rawResponse)
          : review.rawResponse,
      completedAt: new Date(),
      errorMessage: null,
    })
    .where(eq(schema.aiReviews.id, review.id));

  return success({
    reviewId: review.id,
    status: "completed",
    suggestionsCount: suggestions.length,
  });
});
