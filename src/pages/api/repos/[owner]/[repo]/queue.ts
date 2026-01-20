/**
 * Merge Queue API
 * Stack-aware merge queue with CI validation
 */

import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, asc } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { parseBody, unauthorized, badRequest, notFound, success, serverError } from "@/lib/api";
import { z } from "zod";
import crypto from "crypto";

const addToQueueSchema = z.object({
    pullRequestId: z.string(),
    priority: z.number().int().min(0).max(100).default(0),
    mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
});

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

// GET /api/repos/:owner/:repo/queue - Get merge queue for repository
export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const { owner, repo } = params;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find repository
    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, owner as string),
            eq(schema.repositories.name, repo as string)
        ),
    });

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
            stack: true,
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

    // Find repository
    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, owner as string),
            eq(schema.repositories.name, repo as string)
        ),
    });

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
            eq(schema.mergeQueue.status, "pending")
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

    logger.info({ userId: tokenPayload.userId, repoId: repository.id, prId: pullRequestId }, "Added PR to merge queue");

    return success({
        message: "Added to merge queue",
        entry: {
            id: entryId,
            position: queueLength.length,
            estimatedWait: `${queueLength.length * 2} minutes`,
        },
    });
});

// DELETE /api/repos/:owner/:repo/queue/:entryId - Remove from queue
export const DELETE: APIRoute = withErrorHandler(async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const { owner, repo, entryId } = params;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find repository
    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, owner as string),
            eq(schema.repositories.name, repo as string)
        ),
    });

    if (!repository) {
        return notFound("Repository not found");
    }

    // Remove from queue
    await db.delete(schema.mergeQueue).where(eq(schema.mergeQueue.id, entryId as string));

    logger.info({ userId: tokenPayload.userId, repoId: repository.id, entryId }, "Removed from merge queue");

    return success({ message: "Removed from queue" });
});
