import { getDatabase, schema } from "@/db";
import { error, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canWriteRepo } from "@/lib/permissions";
import { addToMergeQueue, processNextInQueue } from "@/lib/merge-queue";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { APIContext } from "astro";

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

    const ownerUser = await db.query.users.findFirst({
        where: eq(schema.users.username, owner!),
    });
    if (!ownerUser) {
        return error("NOT_FOUND", "Repository not found", 404);
    }

    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, ownerUser.id),
            eq(schema.repositories.name, repo!),
        ),
    });
    if (!repository) {
        return error("NOT_FOUND", "Repository not found", 404);
    }

    if (!(await canWriteRepo(user.id, repository, { isAdmin: user.isAdmin ?? undefined }))) {
        return error("FORBIDDEN", "Access denied", 403);
    }

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.id, pullRequestId),
            eq(schema.pullRequests.repositoryId, repository.id),
        ),
    });
    if (!pr) {
        return error("NOT_FOUND", "Pull request not found", 404);
    }
    if (pr.state !== "open" || pr.isMerged) {
        return error("BAD_REQUEST", "Pull request is not open", 400);
    }

    const queueItem = await addToMergeQueue({
        repositoryId: repository.id,
        pullRequestId,
        addedById: user.id,
    });

    // Kick processing asynchronously, but do not block request lifecycle.
    setTimeout(() => {
        processNextInQueue(repository.id).catch(console.error);
    }, 0);

    return success({ message: "Added to merge queue", queueId: queueItem.id });
});
