import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createBranch, getBranches } from "@/lib/git";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, serverError, forbidden, success, created } from "@/lib/api";

// ... existing imports ...

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

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

    if (!(await canReadRepo(user?.id, repo, { isAdmin: user?.isAdmin ?? undefined }))) {
        return unauthorized();
    }

    // Get branches
    const branches = await getBranches(repo.diskPath);
    return success(branches);
});

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

    if (!(await canWriteRepo(user.id, repo, { isAdmin: user.isAdmin ?? undefined }))) {
        return forbidden();
    }

    // Parse body
    const body = await request.json();
    const { name, startPoint } = body;

    if (!name) {
        return badRequest("Branch name is required");
    }

    // Create branch
    await createBranch(repo.diskPath, name, startPoint || "HEAD");

    logger.info({ userId: user.id, repoId: repo.id, branch: name }, "Branch created");

    return created({ success: true });
});
