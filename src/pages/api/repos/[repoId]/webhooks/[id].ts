
import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { canWriteRepo } from "@/lib/permissions";
import { eq, and } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, notFound, forbidden, noContent } from "@/lib/api";

// ... existing imports ...

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { repoId, id } = params; // id is webhookId from file path logic if mapped correctly, but here we are in [repoId]/webhooks/[id].ts. Wait, previous file was index.ts. I need a new file.
    // Actually, I am creating `src/pages/api/repos/[repoId]/webhooks/[id].ts`

    const user = locals.user;
    if (!user || !repoId || !id) return unauthorized();

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repoId),
    });

    if (!repo) return notFound("Not Found");
    if (!await canWriteRepo(user.id, repo)) return forbidden();

    const webhook = await db.query.webhooks.findFirst({
        where: and(
            eq(schema.webhooks.id, id),
            eq(schema.webhooks.repositoryId, repoId)
        )
    });

    if (!webhook) return notFound("Not Found");

    await db.delete(schema.webhooks).where(eq(schema.webhooks.id, id));

    logger.info({ userId: user.id, repoId, webhookId: id }, "Webhook deleted");

    return noContent();
});
