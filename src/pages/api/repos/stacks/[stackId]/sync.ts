/**
 * Sync API Endpoint
 * GET: Get sync status for a stack
 * POST: Trigger sync operation
 */

import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
    getStackSyncStatus,
    pushStackToRemote,
    pullStackFromRemote,
} from "@/lib/sync";

export const GET: APIRoute = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { owner, repo, stackId } = params;
    if (!owner || !repo || !stackId) {
        return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    const db = getDatabase();

    // Get repository
    const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.name, repo),
    });

    if (!repository || !repository.diskPath) {
        return new Response(JSON.stringify({ error: "Repository not found" }), { status: 404 });
    }

    try {
        const syncStatus = await getStackSyncStatus(repository.diskPath, stackId);

        return new Response(JSON.stringify({
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
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error getting sync status:", error);
        return new Response(JSON.stringify({ error: "Failed to get sync status" }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ params, locals, request }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { owner, repo, stackId } = params;
    if (!owner || !repo || !stackId) {
        return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    const db = getDatabase();

    // Get repository
    const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.name, repo),
    });

    if (!repository || !repository.diskPath) {
        return new Response(JSON.stringify({ error: "Repository not found" }), { status: 404 });
    }

    try {
        const body = await request.json();
        const { direction, force } = body;

        let result;

        if (direction === "push") {
            result = await pushStackToRemote(repository.diskPath, stackId, force);
        } else if (direction === "pull") {
            result = await pullStackFromRemote(repository.diskPath, stackId, true);
        } else {
            return new Response(JSON.stringify({ error: "Invalid direction (use 'push' or 'pull')" }), { status: 400 });
        }

        return new Response(JSON.stringify({
            success: result.success,
            message: result.message,
            syncedBranches: result.syncedBranches,
            conflicts: result.conflicts,
        }), {
            status: result.success ? 200 : 400,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error syncing:", error);
        return new Response(JSON.stringify({ error: "Sync failed" }), { status: 500 });
    }
};
