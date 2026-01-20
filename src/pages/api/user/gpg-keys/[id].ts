import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { gpgKeys } from "@/db/schema";
import {
    badRequest,
    notFound,
    serverError,
    success,
    unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id } = params;
    if (!id) return badRequest("Missing ID");

    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Verify ownership
    const key = await db.query.gpgKeys.findFirst({
        where: and(
            eq(gpgKeys.id, id),
            eq(gpgKeys.userId, tokenPayload.userId)
        ),
    });

    if (!key) {
        return notFound("Key not found");
    }

    await db.delete(gpgKeys).where(eq(gpgKeys.id, id));

    logger.info({ userId: tokenPayload.userId, keyId: id }, "GPG key deleted");

    return success({ message: "Key deleted" });
});
