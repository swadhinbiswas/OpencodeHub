import { getDatabase, schema } from "@/db";
import { error, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { queueWorker } from "@/lib/queue-worker";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { APIContext } from "astro";
import { v4 as uuidv4 } from "uuid";

export const POST = withErrorHandler(async ({ params, request, locals }: APIContext) => {
    const user = locals.user;
    if (!user) {
        return unauthorized();
    }

    const { owner, repo } = params;
    const { pullRequestId } = await request.json();

    if (!pullRequestId) {
        return error("BAD_REQUEST", "Pull Request ID is required", 400);
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // 1. Verify Repository
    const repository = await db.query.repositories.findFirst({
        where: and(eq(schema.repositories.name, repo!), eq(schema.repositories.ownerId, user.id)), // basic check, refine for orgs
        with: { owner: true }
    });

    if (!repository || repository.owner.username !== owner) {
        const repoByOwner = await db.query.repositories.findFirst({
            where: eq(schema.repositories.name, repo!),
            with: { owner: true }
        });
        if (!repoByOwner || repoByOwner.owner.username !== owner) {
            return error("NOT_FOUND", "Repository not found", 404);
        }
        // Check basic permissions here...
    }

    // 2. Add to Queue
    const queueItem = {
        id: uuidv4(),
        repositoryId: repository!.id, // Need to fetch correct repo ID if permission check passes
        pullRequestId,
        status: "queued",
        attemptCount: 0,
        queuedAt: new Date(),
    };

    // Fix repo id fetching above or assume owner/repo is correct:
    const targetRepo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.name, repo!),
            eq(schema.repositories.ownerId, (await db.query.users.findFirst({ where: eq(schema.users.username, owner!) }))!.id)
        )
    });

    if (!targetRepo) return error("NOT_FOUND", "Repo not found", 404);

    await db.insert(schema.mergeQueueItems).values({
        ...queueItem,
        repositoryId: targetRepo.id
    });

    // 3. Trigger Worker (Async)
    // In production, this might be a cron or event queue. For now, we trigger immediately.
    queueWorker.processQueue(targetRepo.id).catch(console.error);

    return success({ message: "Added to merge queue", queueId: queueItem.id });
});
