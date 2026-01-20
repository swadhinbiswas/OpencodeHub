
import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { generateId } from "@/lib/utils";
import { canWriteRepo } from "@/lib/permissions";
import { eq } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, forbidden, created } from "@/lib/api";

// ... existing imports ...

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { repoId } = params;
    const user = locals.user;

    if (!user || !repoId) return unauthorized();

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repoId),
    });

    if (!repo) return notFound("Not Found");
    if (!await canWriteRepo(user.id, repo)) return forbidden();

    const body = await request.json();
    const { url, secret, events, active } = body;

    if (!url || !events) {
        return badRequest("Missing required fields");
    }

    const id = generateId();
    await db.insert(schema.webhooks).values({
        id,
        repositoryId: repoId,
        url,
        secret,
        events: JSON.stringify(events),
        active: active, // Changed from isActive
        // contentType: content_type // Add this to schema if needed, defaulting to json for now as it's not in my previous schema definition but was in plan
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    logger.info({ userId: user.id, repoId, webhookId: id }, "Webhook created");

    return created({ id });
});
