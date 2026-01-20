/**
 * Sync API Endpoint
 * GET: Get sync status for a stack
 * POST: Trigger sync operation
 */

import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
    getStackSyncStatus,
    pushStackToRemote,
    pullStackFromRemote,
} from "@/lib/sync";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, serverError, success } from "@/lib/api";

// ... existing imports ...

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        return unauthorized();
    }

    const { owner, repo, stackId } = params;
    if (!owner || !repo || !stackId) {
        return badRequest("Missing parameters");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get repository
    const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.name, repo),
    });

    if (!repository || !repository.diskPath) {
        return notFound("Repository not found");
    }

    const syncStatus = await getStackSyncStatus(repository.diskPath, stackId);

    return success({
        stackId,
        needsSync: syncStatus.needsSync,
        hasConflicts: syncStatus.hasConflicts,
        branches: Object.entries(syncStatus.branchStatuses).map(([branch, status]) => ({
            branch,
            ahead: status.ahead,
            behind: status.behind,
            hasUnpushedChanges: status.hasUnpushedChanges,
            hasRemoteChanges: status.hasRemoteChanges,
        })),
        ci: Object.entries(syncStatus.ciStatuses).map(([prNumber, status]) => ({
            prNumber: parseInt(prNumber),
            status: status.status,
            checkRuns: status.checkRuns,
        })),
    });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
    const user = locals.user;
    if (!user) {
        return unauthorized();
    }

    const { owner, repo, stackId } = params;
    if (!owner || !repo || !stackId) {
        return badRequest("Missing parameters");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get repository
    const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.name, repo),
    });

    if (!repository || !repository.diskPath) {
        return notFound("Repository not found");
    }

    const body = await request.json();
    const { direction, force } = body;

    let result;

    if (direction === "push") {
        result = await pushStackToRemote(repository.diskPath, stackId, force);
    } else if (direction === "pull") {
        result = await pullStackFromRemote(repository.diskPath, stackId, true);
    } else {
        return badRequest("Invalid direction (use 'push' or 'pull')");
    }

    logger.info({ userId: user.id, repoId: repository.id, stackId, direction, result: result.success ? "success" : "failed" }, "Stack sync operation");

    return new Response(JSON.stringify({
        success: result.success,
        message: result.message,
        syncedBranches: result.syncedBranches,
        conflicts: result.conflicts,
    }), {
        status: result.success ? 200 : 400,
        headers: { "Content-Type": "application/json" },
    });
});
