/**
 * Merge Queue API
 * Stack-aware merge queue with CI validation
 */

import { getDatabase, schema } from "@/db";
import {
    badRequest,
    notFound,
    parseBody,
    success,
    unauthorized
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import type { APIRoute } from "astro";
import crypto from "crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

const addToQueueSchema = z.object({
  pullRequestId: z.string(),
  priority: z.number().int().min(0).max(100).default(0),
  mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
});

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
    processNextInQueue,
    removeFromMergeQueue,
    updateQueuePriority,
} from "@/lib/merge-queue";
import { canWriteRepo } from "@/lib/permissions";

// ... existing imports ...

const queueActionSchema = z.object({
  action: z.enum(["retry", "process", "reprioritize"]),
  entryId: z.string().optional(),
  priority: z.number().int().min(-100).max(100).optional(),
});

async function resolveRepository(
  db: NodePgDatabase<typeof schema>,
  owner: string,
  repo: string,
) {
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });

  if (!ownerUser) {
    return null;
  }

  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
}

// GET /api/repos/:owner/:repo/queue - Get merge queue for repository
export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  const { owner, repo } = params;
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const repository = await resolveRepository(
    db,
    owner as string,
    repo as string,
  );

  if (!repository) {
    return notFound("Repository not found");
  }

  // Get queue entries
  const queueEntries = await db.query.mergeQueue.findMany({
    where: eq(schema.mergeQueue.repositoryId, repository.id),
    with: {
      pullRequest: {
        with: {
          author: true,
        },
      },
      addedBy: true,
    },
    orderBy: [asc(schema.mergeQueue.position)],
  });

  return success({ queue: queueEntries });
});

// POST /api/repos/:owner/:repo/queue - Add PR to merge queue
export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  const parsed = await parseBody(request, addToQueueSchema);
  if ("error" in parsed) return parsed.error;

  const { pullRequestId, priority, mergeMethod } = parsed.data;
  const { owner, repo } = params;

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const repository = await resolveRepository(
    db,
    owner as string,
    repo as string,
  );

  if (!repository) {
    return notFound("Repository not found");
  }

  // Find PR
  const pr = await db.query.pullRequests.findFirst({
    where: eq(schema.pullRequests.id, pullRequestId),
  });

  if (!pr) {
    return notFound("Pull request not found");
  }

  // Check if already in queue
  const existing = await db.query.mergeQueue.findFirst({
    where: and(
      eq(schema.mergeQueue.pullRequestId, pullRequestId),
      eq(schema.mergeQueue.status, "pending"),
    ),
  });

  if (existing) {
    return badRequest("PR already in queue");
  }

  // Check if PR is part of a stack
  const stackEntry = await db.query.prStackEntries.findFirst({
    where: eq(schema.prStackEntries.pullRequestId, pullRequestId),
  });

  // Get current queue length for positioning
  const queueLength = await db.query.mergeQueue.findMany({
    where: eq(schema.mergeQueue.repositoryId, repository.id),
  });

  const now = new Date();
  const entryId = `mq_${crypto.randomBytes(8).toString("hex")}`;

  // Add to queue
  await db.insert(schema.mergeQueue).values({
    id: entryId,
    repositoryId: repository.id,
    pullRequestId,
    stackId: stackEntry?.stackId || null,
    status: "pending",
    priority,
    position: queueLength.length,
    ciStatus: "pending",
    addedById: tokenPayload.userId,
    addedAt: now,
    mergeMethod,
  });

  logger.info(
    { userId: tokenPayload.userId, repoId: repository.id, prId: pullRequestId },
    "Added PR to merge queue",
  );

  return success({
    message: "Added to merge queue",
    entry: {
      id: entryId,
      position: queueLength.length,
      estimatedWait: `${queueLength.length * 2} minutes`,
    },
  });
});

export const PATCH: APIRoute = withErrorHandler(async ({ params, request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  const parsed = await parseBody(request, queueActionSchema);
  if ("error" in parsed) return parsed.error;

  const { owner, repo } = params;
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await resolveRepository(
    db,
    owner as string,
    repo as string,
  );

  if (!repository) {
    return notFound("Repository not found");
  }

  const actor = await db.query.users.findFirst({
    where: eq(schema.users.id, tokenPayload.userId),
  });

  if (
    !actor ||
    !(await canWriteRepo(actor.id, repository, {
      isAdmin: actor.isAdmin ?? undefined,
    }))
  ) {
    return badRequest("Insufficient permissions to manage queue");
  }

  const { action, entryId, priority } = parsed.data;

  if (action === "process") {
    const result = await processNextInQueue(repository.id);
    return success({
      message: result.processed
        ? "Queue processing started"
        : result.reason || "Queue not processed",
      result,
    });
  }

  if (!entryId) {
    return badRequest("Queue entry ID is required");
  }

  const entry = await db.query.mergeQueue.findFirst({
    where: and(
      eq(schema.mergeQueue.id, entryId),
      eq(schema.mergeQueue.repositoryId, repository.id),
    ),
    orderBy: [desc(schema.mergeQueue.addedAt)],
  });

  if (!entry) {
    return notFound("Queue entry not found");
  }

  if (action === "retry") {
    await db
      .update(schema.mergeQueue)
      .set({
        status: "pending",
        ciStatus: "pending",
        failureReason: null,
        completedAt: null,
        startedAt: null,
        lastAttemptAt: new Date(),
        attemptCount: (entry.attemptCount || 0) + 1,
      })
      .where(eq(schema.mergeQueue.id, entry.id));

    logger.info(
      { userId: actor.id, repoId: repository.id, entryId },
      "Retried merge queue entry",
    );

    setTimeout(() => {
      processNextInQueue(repository.id).catch(console.error);
    }, 0);

    return success({ message: "Queue entry retried" });
  }

  if (action === "reprioritize") {
    if (typeof priority !== "number") {
      return badRequest("Priority is required");
    }

    await updateQueuePriority(entry.id, priority);
    logger.info(
      { userId: actor.id, repoId: repository.id, entryId, priority },
      "Reprioritized merge queue entry",
    );
    return success({ message: "Queue entry reprioritized" });
  }

  return badRequest("Unsupported action");
});

// DELETE /api/repos/:owner/:repo/queue?entryId=... - Remove from queue
export const DELETE: APIRoute = withErrorHandler(
  async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
      return unauthorized();
    }

    const { owner, repo } = params;
    const url = new URL(request.url);
    const entryId = url.searchParams.get("entryId");
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const repository = await resolveRepository(
      db,
      owner as string,
      repo as string,
    );

    if (!repository) {
      return notFound("Repository not found");
    }

    if (!entryId) {
      return badRequest("Queue entry ID is required");
    }

    const actor = await db.query.users.findFirst({
      where: eq(schema.users.id, tokenPayload.userId),
    });

    if (
      !actor ||
      !(await canWriteRepo(actor.id, repository, {
        isAdmin: actor.isAdmin ?? undefined,
      }))
    ) {
      return badRequest("Insufficient permissions to manage queue");
    }

    const entry = await db.query.mergeQueue.findFirst({
      where: and(
        eq(schema.mergeQueue.id, entryId),
        eq(schema.mergeQueue.repositoryId, repository.id),
      ),
    });

    if (!entry) {
      return notFound("Queue entry not found");
    }

    await removeFromMergeQueue(entry.pullRequestId);

    logger.info(
      { userId: tokenPayload.userId, repoId: repository.id, entryId },
      "Removed from merge queue",
    );

    return success({ message: "Removed from queue" });
  },
);
