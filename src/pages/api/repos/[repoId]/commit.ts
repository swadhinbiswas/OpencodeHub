
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { commitFile } from "@/lib/git";
import { canWriteRepo } from "@/lib/permissions";
import { analyzeRepository } from "@/lib/analysis";

export const POST: APIRoute = async ({ params, request, locals }) => {
    const { repoId } = params;
    const user = locals.user;

    if (!user || !repoId) {
        return new Response("Unauthorized", { status: 401 });
    }

    try {
        const body = await request.json();
        const { branch, path, content, message } = body;

        if (!branch || !path || content === undefined || !message) {
            return new Response("Missing required fields", { status: 400 });
        }

        const db = getDatabase();
        const repo = await db.query.repositories.findFirst({
            where: eq(schema.repositories.id, repoId)
        });

        if (!repo) return new Response("Repository not found", { status: 404 });

        // Auth Check
        const hasAccess = await canWriteRepo(user.id, repo);
        if (!hasAccess) return new Response("Forbidden", { status: 403 });

        // Commit
        const commitSha = await commitFile(
            repo.diskPath,
            branch,
            path,
            content,
            message,
            { name: user.displayName || user.username, email: user.email }
        );

        // Analyze (Fire and forget)
        analyzeRepository(repo.id, user.id).catch(console.error);

        return new Response(JSON.stringify({ success: true, sha: commitSha }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (e) {
        console.error("Commit error:", e);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
};
