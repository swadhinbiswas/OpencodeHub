
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm"; // Fixed import
import { canWriteRepo } from "@/lib/permissions";
import { checkConflicts, resolveConflicts } from "@/lib/conflicts";

export const GET: APIRoute = async ({ params, locals }) => {
    const { owner, repo, id: queueItemId } = params;
    const user = locals.user;

    if (!user) {
        return new Response("Unauthorized", { status: 401 });
    }

    const db = getDatabase();

    // 1. Fetch Repo
    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.name, repo!),
            eq(schema.repositories.ownerId, (
                await db.query.users.findFirst({
                    where: eq(schema.users.username, owner!),
                    columns: { id: true }
                })
            )?.id || "")
        ),
        with: { owner: true }
    });

    if (!repository) return new Response("Repo not found", { status: 404 });

    // 2. Check Permissions
    if (!(await canWriteRepo(user.id, repository))) {
        return new Response("Forbidden", { status: 403 });
    }

    try {
        const conflicts = await checkConflicts(repository.id, queueItemId!);
        return new Response(JSON.stringify(conflicts), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e: any) {
        console.error("Conflict check error:", e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ params, request, locals }) => {
    const { owner, repo, id: queueItemId } = params;
    const user = locals.user;

    if (!user) {
        return new Response("Unauthorized", { status: 401 });
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // 1. Fetch Repo (Recycled logic, maybe middleware later)
    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.name, repo!),
            eq(schema.repositories.ownerId, (
                await db.query.users.findFirst({
                    where: eq(schema.users.username, owner!),
                    columns: { id: true }
                })
            )?.id || "")
        ),
        with: { owner: true }
    });

    if (!repository) return new Response("Repo not found", { status: 404 });

    if (!(await canWriteRepo(user.id, repository))) {
        return new Response("Forbidden", { status: 403 });
    }

    try {
        const { resolutions } = await request.json();
        if (!resolutions || !Array.isArray(resolutions)) {
            return new Response("Invalid body", { status: 400 });
        }

        await resolveConflicts(repository.id, queueItemId!, resolutions);

        // Success! Update DB state
        // 1. Update Queue Item
        await db.update(schema.mergeQueueItems)
            .set({
                status: "merged",
                completedAt: new Date()
            })
            .where(eq(schema.mergeQueueItems.id, queueItemId!));

        // 2. Update PR state (Need PR ID from queue item)
        const item = await db.query.mergeQueueItems.findFirst({
            where: eq(schema.mergeQueueItems.id, queueItemId!),
            columns: { pullRequestId: true }
        });

        if (item) {
            const now = new Date();
            await db.update(schema.pullRequests)
                .set({
                    state: "merged",
                    isMerged: true,
                    mergedAt: now,
                    updatedAt: now,
                })
                .where(eq(schema.pullRequests.id, item.pullRequestId));
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e: any) {
        console.error("Conflict resolution error:", e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
