import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { checkPathPermissions } from "@/lib/path-scoping";

const batchReviewSchema = z.object({
  state: z.enum(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]).default("COMMENTED"),
  body: z.string().max(10000).optional(),
  commitSha: z.string().optional(),
  comments: z
    .array(
      z.object({
        body: z.string().min(1).max(20000),
        path: z.string().optional(),
        line: z.number().int().positive().optional(),
        side: z.enum(["LEFT", "RIGHT"]).optional(),
        startLine: z.number().int().positive().optional(),
        commitSha: z.string().optional(),
        inReplyToId: z.string().optional(),
        suggestedChange: z.string().optional(),
      })
    )
    .min(1)
    .max(100),
});

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
  const { owner: ownerName, repo: repoName, number } = params;
  const user = locals.user;
  if (!user) return unauthorized();
  const userId = user.id;
  if (!userId) return unauthorized();
  if (!ownerName || !repoName || !number) return badRequest("Missing parameters");

  const parsed = await parseBody(request, batchReviewSchema);
  if ("error" in parsed) return parsed.error;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repoOwner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!repoOwner) return notFound("Repository not found");

  const repo = await db.query.repositories.findFirst({
    where: and(eq(schema.repositories.ownerId, repoOwner.id), eq(schema.repositories.name, repoName)),
  });
  if (!repo) return notFound("Repository not found");

  if (!(await canReadRepo(userId, repo))) {
    return notFound("Repository not found");
  }
  if (parsed.data.state !== "COMMENTED" && !(await canWriteRepo(userId, repo))) {
    return forbidden("Write access required to approve or request changes");
  }

  const pr = await db.query.pullRequests.findFirst({
    where: and(eq(schema.pullRequests.repositoryId, repo.id), eq(schema.pullRequests.number, Number.parseInt(number, 10))),
  });
  if (!pr) return notFound("Pull request not found");
  if (pr.authorId === userId && parsed.data.state !== "COMMENTED") {
    return badRequest("Authors cannot approve or request changes on their own PR");
  }

  const scopedPaths = Array.from(
    new Set(
      parsed.data.comments
        .map((comment) => comment.path?.trim())
        .filter((path): path is string => Boolean(path))
    )
  );
  if (scopedPaths.length > 0) {
    const permission = await checkPathPermissions(userId, repo.id, scopedPaths, "write");
    if (!permission.allowed) {
      return forbidden(permission.reason || "Insufficient path permissions for one or more review comments");
    }
  }

  const reviewId = nanoid();
  const now = new Date();
  const createdCommentIds: string[] = [];

  try {
    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.pullRequestReviews).values({
      id: reviewId,
      pullRequestId: pr.id,
      reviewerId: userId,
      state: parsed.data.state.toLowerCase(),
      body: parsed.data.body || "Review submitted",
      commitSha: parsed.data.commitSha ?? null,
      submittedAt: now,
    });

    for (const commentInput of parsed.data.comments) {
      let body = commentInput.body;
      if (commentInput.suggestedChange) {
        body += `\n\n\`\`\`suggestion\n${commentInput.suggestedChange}\n\`\`\``;
      }

      const commentId = `comment_${crypto.randomBytes(8).toString("hex")}`;
      createdCommentIds.push(commentId);
      await db.insert(schema.pullRequestComments).values({
        id: commentId,
        pullRequestId: pr.id,
        reviewId,
        authorId: userId,
        body,
        path: commentInput.path ?? null,
        line: commentInput.line ?? null,
        side: commentInput.side || "RIGHT",
        startLine: commentInput.startLine ?? null,
        commitSha: commentInput.commitSha || parsed.data.commitSha || null,
        inReplyToId: commentInput.inReplyToId ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (error) {
    if (createdCommentIds.length > 0) {
      await db.delete(schema.pullRequestComments).where(inArray(schema.pullRequestComments.id, createdCommentIds));
    }
    await db.delete(schema.pullRequestReviews).where(eq(schema.pullRequestReviews.id, reviewId));
    throw error;
  }

  import("@/lib/automations")
    .then(({ triggerAutomation }) => {
      let triggerEvent: "pr_approved" | "pr_changes_requested" | null = null;
      if (parsed.data.state === "APPROVED") triggerEvent = "pr_approved";
      else if (parsed.data.state === "CHANGES_REQUESTED") triggerEvent = "pr_changes_requested";

      if (!triggerEvent) return;
      triggerAutomation(repo.id, triggerEvent, {
        pullRequestId: pr.id,
        userId,
        metadata: { reviewId, commentCount: parsed.data.comments.length, body: parsed.data.body },
      }).catch((e) => logger.error({ error: e }, "Batch review automation trigger failed"));
    })
    .catch((e) => logger.error({ error: e }, "Batch review automation import failed"));

  logger.info(
    { userId, repoId: repo.id, prId: pr.id, reviewId, commentCount: parsed.data.comments.length },
    "PR batch review submitted"
  );

  return success({
    id: reviewId,
    state: parsed.data.state,
    commentCount: parsed.data.comments.length,
  });
});
