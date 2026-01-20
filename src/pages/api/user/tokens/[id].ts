import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { personalAccessTokens } from "@/db/schema";
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
    const token = await db.query.personalAccessTokens.findFirst({
        where: and(
            eq(personalAccessTokens.id, id),
            eq(personalAccessTokens.userId, tokenPayload.userId)
        ),
    });

    if (!token) {
        return notFound("Token not found");
    }

    await db.delete(personalAccessTokens).where(eq(personalAccessTokens.id, id));

    logger.info({ userId: tokenPayload.userId, tokenId: id }, "Personal Access Token deleted (legacy endpoint)");

    return success({ message: "Token deleted" });
});
