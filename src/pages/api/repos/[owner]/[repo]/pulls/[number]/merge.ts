import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { mergeBranch } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, serverError, forbidden, success, conflict } from "@/lib/api";

// ... existing imports ...

export const POST: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName, number } = params;
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    // Validate inputs
    if (!ownerName || !repoName || !number) {
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

    // Get PR
    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repo.id),
            eq(schema.pullRequests.number, parseInt(number))
        )
    });

    if (!pr) {
        return notFound("Pull request not found");
    }

    if (pr.state !== "open") {
        return badRequest("Pull request is not open");
    }

    // Merge branch
    const repoPath = await resolveRepoPath(repo.diskPath);
    const result = await mergeBranch(repoPath, pr.baseBranch, pr.headBranch);

    if (result.success) {
        // Update PR state with all merge fields
        const now = new Date();
        await db.update(schema.pullRequests)
            .set({
                state: "merged",
                isMerged: true,
                mergedAt: now,
                mergedById: user.id,
                updatedAt: now,
            })
            .where(eq(schema.pullRequests.id, pr.id));

        logger.info({ userId: user.id, repoId: repo.id, prNumber: number }, "Pull request merged");

        return success({ success: true });
    } else {
        return conflict(result.message);
    }
});
