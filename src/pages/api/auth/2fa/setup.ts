
import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { generate2FASecret, getUserFromRequest } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { unauthorized, success, serverError } from "@/lib/api";

import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
    const userPayload = await getUserFromRequest(request);
    if (!userPayload) {
        return unauthorized();
    }

    // Generate secret
    const { secret, uri } = generate2FASecret(userPayload.username);

    // Save secret to DB (temporarily or pending verification)
    // Actually, we usually save it to `twoFactorSecret` but user.twoFactorEnabled remains false until verified.
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    await db
        .update(schema.users)
        .set({ twoFactorSecret: secret }) // Store secret, but don't enable it yet
        .where(eq(schema.users.id, userPayload.userId));

    logger.info({ userId: userPayload.userId }, "2FA setup initiated");

    return success({ secret, uri });
});
