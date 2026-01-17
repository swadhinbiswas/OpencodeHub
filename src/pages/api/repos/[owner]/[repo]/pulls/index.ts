import { getDatabase, schema } from "@/db";
import { compareBranches, getCommit } from "@/lib/git";
import { canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export const POST: APIRoute = async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) {
        return new Response("Unauthorized", { status: 401 });
    }

    // Validate inputs
    if (!ownerName || !repoName) {
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

    // Parse body
    const body = await request.json();
    const { title, body: description, base, head } = body;

    if (!title || !base || !head) {
        return new Response("Missing required fields", { status: 400 });
    }

    if (base === head) {
        return new Response("Base and head branches must be different", { status: 400 });
    }

    try {
        const repoPath = repo.diskPath;

        // Verify branches exist and get SHAs
        // In a real implementation we should verify they exist using git.branch() or similar
        // For now we trust the client but get the SHAs via git rev-parse (or log -1)

        // Get Head SHA
        const headCommit = await getCommit(repoPath, head);
        if (!headCommit) {
            return new Response(`Head branch ${head} not found`, { status: 404 });
        }

        // Get Base SHA
        const baseCommit = await getCommit(repoPath, base);
        if (!baseCommit) {
            return new Response(`Base branch ${base} not found`, { status: 404 });
        }

        // Calculate diff stats
        const { diffs } = await compareBranches(repoPath, base, head);

        // Calculate stats
        let additions = 0;
        let deletions = 0;
        let changedFiles = 0;

        diffs.forEach(diff => {
            additions += diff.additions;
            deletions += diff.deletions;
            changedFiles++;
        });

        // Determine PR number
        const lastPr = await db.query.pullRequests.findFirst({
            where: eq(schema.pullRequests.repositoryId, repo.id),
            orderBy: [desc(schema.pullRequests.number)],
        });

        const number = (lastPr?.number || 0) + 1;

        // Create PR
        const prId = nanoid();
        await db.insert(schema.pullRequests).values({
            id: prId,
            repositoryId: repo.id,
            number,
            title,
            body: description || "",
            state: "open",
            authorId: user.id,
            headBranch: head,
            headSha: headCommit.sha,
            baseBranch: base,
            baseSha: baseCommit.sha,
            additions,
            deletions,
            changedFiles
        });

        return new Response(JSON.stringify({ id: prId, number }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(`Failed to create pull request: ${error}`, { status: 500 });
    }
};
