import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { compareBranches, getMergeBase } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { unauthorized, badRequest, notFound, serverError, success } from "@/lib/api";

// ... existing imports ...

export const GET: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const url = new URL(request.url);
    const base = url.searchParams.get("base");
    const head = url.searchParams.get("head");
    const user = locals.user;

    // Validate inputs
    if (!ownerName || !repoName || !base || !head) {
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

    if (!(await canReadRepo(user?.id, repo))) {
        return unauthorized();
    }

    // Compare branches
    const repoPath = await resolveRepoPath(repo.diskPath);
    const { commits, diffs } = await compareBranches(repoPath, base, head);
    const mergeBase = await getMergeBase(repoPath, base, head);

    return success({ commits, diffs, mergeBase });
});
