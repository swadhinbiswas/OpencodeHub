import { getDatabase, schema } from "@/db";
import { mergeBranch } from "@/lib/git";
import { canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const POST: APIRoute = async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName, number } = params;
    const user = locals.user;

    if (!user) {
        return new Response("Unauthorized", { status: 401 });
    }

    // Validate inputs
    if (!ownerName || !repoName || !number) {
        return new Response("Missing parameters", { status: 400 });
    }

    // Check repo existence and permissions
    const db = getDatabase();
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName),
    });

    if (!repoOwner) {
        return new Response("Repository not found", { status: 404 });
    }

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repoName)
        ),
    });

    if (!repo) {
        return new Response("Repository not found", { status: 404 });
    }

    if (!(await canWriteRepo(user.id, repo))) {
        return new Response("Forbidden", { status: 403 });
    }

    // Get PR
    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repo.id),
            eq(schema.pullRequests.number, parseInt(number))
        )
    });

    if (!pr) {
        return new Response("Pull request not found", { status: 404 });
    }

    if (pr.state !== "open") {
        return new Response("Pull request is not open", { status: 400 });
    }

    // Merge branch
    try {
        const result = await mergeBranch(repo.diskPath, pr.baseBranch, pr.headBranch);

        if (result.success) {
            // Update PR state with all merge fields
            const now = new Date().toISOString();
            await db.update(schema.pullRequests)
                .set({
                    state: "merged",
                    isMerged: true,
                    mergedAt: now,
                    mergedById: user.id,
                    updatedAt: now,
                })
                .where(eq(schema.pullRequests.id, pr.id));

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        } else {
            return new Response(JSON.stringify({ success: false, message: result.message }), {
                status: 409, // Conflict
                headers: { "Content-Type": "application/json" },
            });
        }

    } catch (error) {
        return new Response(`Failed to merge branch: ${error}`, { status: 500 });
    }
};
