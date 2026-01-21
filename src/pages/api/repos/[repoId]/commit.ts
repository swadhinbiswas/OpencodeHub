
import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { commitFile } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { canWriteRepo } from "@/lib/permissions";
import { analyzeRepository } from "@/lib/analysis";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, forbidden, success } from "@/lib/api";

// ... existing imports ...

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { repoId } = params;
    const user = locals.user;

    if (!user || !repoId) {
        return unauthorized();
    }

    const body = await request.json();
    const { branch, path, content, message } = body;

    if (!branch || !path || content === undefined || !message) {
        return badRequest("Missing required fields");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repoId)
    });

    if (!repo) return notFound("Repository not found");

    // Auth Check
    const hasAccess = await canWriteRepo(user.id, repo);
    if (!hasAccess) return forbidden();

    // Commit
    const repoPath = await resolveRepoPath(repo.diskPath);
    const commitSha = await commitFile(
        repoPath,
        branch,
        path,
        content,
        message,
        { name: user.displayName || user.username, email: user.email }
    );

    // Analyze (Fire and forget)
    analyzeRepository(repo.id, user.id).catch(err => {
        logger.error({ err, repoId, userId: user.id }, "Background repository analysis failed");
    });

    logger.info({ userId: user.id, repoId, commitSha, path }, "File committed");

    return success({ success: true, sha: commitSha });
});
