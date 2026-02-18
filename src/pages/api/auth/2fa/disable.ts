
import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest, verify2FAToken } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { unauthorized, success, serverError, badRequest } from "@/lib/api";

import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
    const userPayload = await getUserFromRequest(request);
    if (!userPayload) {
        return unauthorized();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";

    if (!token) {
        return badRequest("Authentication code required");
    }

    const currentUser = await db.query.users.findFirst({
        where: eq(schema.users.id, userPayload.userId),
    });
    if (!currentUser?.twoFactorEnabled || !currentUser.twoFactorSecret) {
        return badRequest("2FA is not enabled");
    }

    const isValid = verify2FAToken(token, currentUser.twoFactorSecret);
    if (!isValid) {
        return badRequest("Invalid authentication code");
    }

    await db.update(schema.users)
        .set({
            twoFactorEnabled: false,
            twoFactorSecret: null
        })
        .where(eq(schema.users.id, userPayload.userId));

    logger.info({ userId: userPayload.userId }, "2FA disabled");

    return success({ message: "2FA disabled successfully" });
});
