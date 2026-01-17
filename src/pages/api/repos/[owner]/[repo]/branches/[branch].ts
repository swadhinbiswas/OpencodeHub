import { getDatabase, schema } from "@/db";
import { deleteBranch } from "@/lib/git";
import { canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const DELETE: APIRoute = async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName, branch } = params;
    const user = locals.user;

    if (!user) {
        return new Response("Unauthorized", { status: 401 });
    }

    // Validate inputs
    if (!ownerName || !repoName || !branch) {
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

    // Prevent deleting default branch
    if (branch === repo.defaultBranch) {
        return new Response("Cannot delete default branch", { status: 400 });
    }

    // Delete branch
    try {
        await deleteBranch(repo.diskPath, branch);
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(`Failed to delete branch: ${error}`, { status: 500 });
    }
};
