import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import crypto from "crypto";
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

const CALLBACK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const CALLBACK_EVENT_TTL_MS = 10 * 60 * 1000;
const seenEventIds = new Map<string, number>();

function timingSafeMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function parseTimestampToMs(timestampHeader: string | null): number | null {
  if (!timestampHeader) return null;
  const parsed = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(parsed)) return null;
  // Accept unix seconds or milliseconds for compatibility.
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}

function purgeExpiredEvents(now: number): void {
  for (const [eventId, expiresAt] of seenEventIds.entries()) {
    if (expiresAt <= now) {
      seenEventIds.delete(eventId);
    }
  }
}

function registerEventId(eventId: string, now: number): boolean {
  purgeExpiredEvents(now);
  if (seenEventIds.has(eventId)) {
    return false;
  }
  seenEventIds.set(eventId, now + CALLBACK_EVENT_TTL_MS);
  return true;
}

function isAuthorized(request: Request, rawBody: string): { ok: boolean; reason?: string } {
  const expected =
    process.env.EXTERNAL_AGENT_CALLBACK_SECRET || process.env.INTERNAL_HOOK_SECRET;
  if (!expected) return { ok: false, reason: "Callback secret is not configured" };

  const bearerAuth = request.headers.get("authorization");
  if (bearerAuth === `Bearer ${expected}`) {
    return { ok: true };
  }

  const timestampHeader = request.headers.get("x-opencodehub-timestamp");
  const signatureHeader = request.headers.get("x-opencodehub-signature");
  const eventId =
    request.headers.get("x-opencodehub-event-id") || request.headers.get("x-request-id");

  if (!timestampHeader || !signatureHeader || !eventId) {
    return { ok: false, reason: "Missing callback authentication headers" };
  }

  const timestampMs = parseTimestampToMs(timestampHeader);
  if (!timestampMs) {
    return { ok: false, reason: "Invalid callback timestamp" };
  }

  const now = Date.now();
  if (Math.abs(now - timestampMs) > CALLBACK_TIMESTAMP_TOLERANCE_MS) {
    return { ok: false, reason: "Callback timestamp is outside allowed window" };
  }

  const signedPayload = `${timestampHeader}.${rawBody}`;
  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", expected)
    .update(signedPayload)
    .digest("hex")}`;
  if (!timingSafeMatch(expectedSignature, signatureHeader)) {
    return { ok: false, reason: "Invalid callback signature" };
  }

  if (!registerEventId(eventId, now)) {
    return { ok: false, reason: "Duplicate callback event" };
  }

  return { ok: true };
}

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const rawBody = await request.text();
  const auth = isAuthorized(request, rawBody);
  if (!auth.ok) {
    return unauthorized(auth.reason);
  }

  const { owner, repo: repoName, number } = params;
  const prNumber = Number.parseInt(number || "", 10);
  if (!owner || !repoName || Number.isNaN(prNumber)) {
    return badRequest("Invalid repository or pull request");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return badRequest("Invalid callback payload");
  }

  const parsed = callbackSchema.safeParse(payload);
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
