import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { badRequest, noContent, success } from "@/lib/api";

// ... existing imports ...

export const DELETE: APIRoute = withErrorHandler(async ({ params }) => {
    const { repoId, id } = params;
    if (!repoId || !id) return badRequest("IDs required");

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    await db.delete(schema.branchProtection)
        .where(and(
            eq(schema.branchProtection.id, id),
            eq(schema.branchProtection.repositoryId, repoId)
        ));

    logger.info({ repoId, ruleId: id }, "Branch protection rule deleted");

    return noContent();
});

export const PUT: APIRoute = withErrorHandler(async ({ params, request }) => {
    const { repoId, id } = params;
    if (!repoId || !id) return badRequest("IDs required");

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return badRequest("Invalid JSON");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    await db.update(schema.branchProtection)
        .set({
            ...body,
            updatedAt: new Date()
        })
        .where(and(
            eq(schema.branchProtection.id, id),
            eq(schema.branchProtection.repositoryId, repoId)
        ));

    logger.info({ repoId, ruleId: id }, "Branch protection rule updated");

    return success({ success: true });
});
