
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
    const {
        url,
        secret,
        events,
        active,
        contentType: rawContentType,
        content_type,
        name,
        provider,
    } = body;

    if (!url || !events) {
        return badRequest("Missing required fields");
    }
    if (!Array.isArray(events) || events.length === 0) {
        return badRequest("events must be a non-empty array");
    }

    const normalizedContentType = rawContentType || content_type || "json";
    if (!["json", "form"].includes(normalizedContentType)) {
        return badRequest("Invalid contentType. Supported values: json, form");
    }
    const isActive = active === undefined ? true : Boolean(active);

    const id = generateId();
    await db.insert(schema.webhooks).values({
        id,
        repositoryId: repoId,
        provider: provider || "generic",
        name: name || null,
        url,
        secret: secret || null,
        events: JSON.stringify(events),
        active: isActive,
        enabled: isActive,
        contentType: normalizedContentType,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: user.id,
    });

    logger.info({ userId: user.id, repoId, webhookId: id }, "Webhook created");

    return created({ id });
});
