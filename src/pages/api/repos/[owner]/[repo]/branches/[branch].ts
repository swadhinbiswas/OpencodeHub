import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { deleteBranch } from "@/lib/git";
import { canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, serverError, forbidden, success } from "@/lib/api";

// ... existing imports ...

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName, branch } = params;
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    // Validate inputs
    if (!ownerName || !repoName || !branch) {
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

    // Prevent deleting default branch
    if (branch === repo.defaultBranch) {
        return badRequest("Cannot delete default branch");
    }

    // Delete branch
    await deleteBranch(repo.diskPath, branch);

    logger.info({ userId: user.id, repoId: repo.id, branch }, "Branch deleted");

    return success({ success: true });
});
