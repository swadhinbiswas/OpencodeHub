import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canWriteRepo } from "@/lib/permissions";
import { runSecurityScan } from "@/lib/security";
import { resolveRepoPath } from "@/lib/git-storage";
import { generateId } from "@/lib/utils";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, notFound, forbidden } from "@/lib/api";

// ... existing imports ...

export const POST: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName!),
    });

    if (!repoOwner) return notFound("Not Found");

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repoName!)
        ),
    });

    if (!repo) return notFound("Not Found");

    if (!(await canWriteRepo(user.id, repo))) {
        return forbidden();
    }

    // Create scan record
    const scanId = generateId();
    await db.insert(schema.securityScans).values({
        id: scanId,
        repositoryId: repo.id,
        status: "queued",
        startedAt: new Date(),
    });

    // Start scan asynchronously
    const repoPath = await resolveRepoPath(repo.diskPath);
    runSecurityScan(repoPath, scanId, repo.id).catch(err => {
        logger.error({ err, repoId: repo.id, scanId }, "Background scan failed to start properly");
    });

    logger.info({ userId: user.id, repoId: repo.id, scanId }, "Security scan queued");

    return new Response(JSON.stringify({ scanId, status: "queued" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
    });
});
