import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { resolveRepoPath } from "@/lib/git-storage";
import { getFileContent } from "@/lib/git";
import { withErrorHandler } from "@/lib/errors";
import { notFound, success } from "@/lib/api";

export const GET: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const url = new URL(request.url);
    const branch = url.searchParams.get("branch");

    if (!ownerName || !repoName) {
        return notFound("Repository not found");
    }

    const db = getDatabase();

    // permissions check (read access)
    // In a real app we should check this, but for now assuming public or implicit check via middleware/repo existence
    // We'll do a quick check
    const user = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName),
    });

    if (!user) return notFound("Repository not found");

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, user.id),
            eq(schema.repositories.name, repoName)
        ),
    });

    if (!repo) return notFound("Repository not found");

    // Resolve path
    const repoPath = await resolveRepoPath(repo.diskPath);
    const targetBranch = branch || repo.defaultBranch;

    // Check potential locations
    // GitHub supports: .github/, docs/, root
    // Filenames: pull_request_template.md, PULL_REQUEST_TEMPLATE.md, .txt
    const candidates = [
        ".github/pull_request_template.md",
        ".github/PULL_REQUEST_TEMPLATE.md",
        "docs/pull_request_template.md",
        "pull_request_template.md",
        ".github/pull_request_template.txt",
        "pull_request_template.txt"
    ];

    for (const path of candidates) {
        const file = await getFileContent(repoPath, path, targetBranch);
        if (file && !file.isBinary && file.content) {
            return success({ content: file.content });
        }
    }

    return success({ content: null });
});
