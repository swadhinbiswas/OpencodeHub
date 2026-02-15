
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { canWriteRepo } from "@/lib/permissions";
import { rewriteBranchHistory, type RewriteOperation } from "@/lib/git-rewrite";

export const POST: APIRoute = async ({ params, request, locals }) => {
    const { owner, repo: repoName, number } = params;
    const user = locals.user;

    if (!user) {
        return new Response("Unauthorized", { status: 401 });
    }

    const db = getDatabase();

    // 1. Fetch Repo & PR
    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.name, repoName!),
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

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.number, parseInt(number!))
        )
    });

    if (!pr) return new Response("PR not found", { status: 404 });

    // 2. Check Permissions
    if (!(await canWriteRepo(user.id, repository))) {
        return new Response("Forbidden", { status: 403 });
    }

    try {
        const { operations } = await request.json() as { operations: RewriteOperation[] };

        if (!operations || !Array.isArray(operations)) {
            return new Response("Invalid operations", { status: 400 });
        }

        // 3. Execute Rewrite
        await rewriteBranchHistory(
            repository.owner.username,
            repository.name,
            pr.baseBranch,
            pr.headBranch,
            operations
        );

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        console.error("Rewrite failed:", e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
