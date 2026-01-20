
import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { unauthorized, success, serverError } from "@/lib/api";

import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
    const userPayload = await getUserFromRequest(request);
    if (!userPayload) {
        return unauthorized();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // In a real app, we might require a password or 2FA token to disable 2FA.
    // For now, we will just disable it.

    await db.update(schema.users)
        .set({
            twoFactorEnabled: false,
            twoFactorSecret: null
        })
        .where(eq(schema.users.id, userPayload.userId));

    logger.info({ userId: userPayload.userId }, "2FA disabled");

    return success({ message: "2FA disabled successfully" });
});
