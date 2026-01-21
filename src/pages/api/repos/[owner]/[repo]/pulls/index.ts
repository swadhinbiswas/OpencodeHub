import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { compareBranches, getCommit } from "@/lib/git";
import { canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, serverError, forbidden, created } from "@/lib/api";

// ... existing imports ...

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    // Validate inputs
    if (!ownerName || !repoName) {
        return badRequest("Missing parameters");
    }

    // Check repo existence and permissions
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName),
    });

    if (!repoOwner) {
        return notFound("Repository not found");
    }

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repoName)
        ),
    });

    if (!repo) {
        return notFound("Repository not found");
    }

    if (!(await canWriteRepo(user.id, repo))) {
        return forbidden();
    }

    // Parse body
    const body = await request.json();
    const { title, body: description, base, head } = body;

    if (!title || !base || !head) {
        return badRequest("Missing required fields");
    }

    if (base === head) {
        return badRequest("Base and head branches must be different");
    }

    const repoPath = await resolveRepoPath(repo.diskPath);

    // Verify branches exist and get SHAs
    // In a real implementation we should verify they exist using git.branch() or similar
    // For now we trust the client but get the SHAs via git rev-parse (or log -1)

    // Get Head SHA
    const headCommit = await getCommit(repoPath, head);
    if (!headCommit) {
        return notFound(`Head branch ${head} not found`);
    }

    // Get Base SHA
    const baseCommit = await getCommit(repoPath, base);
    if (!baseCommit) {
        return notFound(`Base branch ${base} not found`);
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

    logger.info({ userId: user.id, repoId: repo.id, prNumber: number }, "Pull request created");

    return created({ id: prId, number });
});
