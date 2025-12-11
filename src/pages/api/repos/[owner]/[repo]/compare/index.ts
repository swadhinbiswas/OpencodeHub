import { getDatabase, schema } from "@/db";
import { compareBranches, getMergeBase } from "@/lib/git";
import { canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const GET: APIRoute = async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const url = new URL(request.url);
    const base = url.searchParams.get("base");
    const head = url.searchParams.get("head");
    const user = locals.user;

    // Validate inputs
    if (!ownerName || !repoName || !base || !head) {
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

    if (!(await canReadRepo(user?.id, repo))) {
        return new Response("Unauthorized", { status: 401 });
    }

    // Compare branches
    try {
        const { commits, diffs } = await compareBranches(repo.diskPath, base, head);
        const mergeBase = await getMergeBase(repo.diskPath, base, head);

        return new Response(JSON.stringify({ commits, diffs, mergeBase }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(`Failed to compare branches: ${error}`, { status: 500 });
    }
};
