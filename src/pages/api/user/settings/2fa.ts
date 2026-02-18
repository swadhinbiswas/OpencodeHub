
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getUserFromRequest, generate2FASecret, verify2FAToken } from "@/lib/auth";
import { unauthorized, badRequest, success, serverError } from "@/lib/api";
import QRCode from "qrcode";
import { users } from "@/db/schema";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export const GET: APIRoute = async ({ request }) => {
    try {
        const user = await getUserFromRequest(request);
        if (!user) return unauthorized();

        // If already enabled, return status
        const db = getDatabase();
        const currentUser = await db.query.users.findFirst({
            where: eq(schema.users.id, user.userId),
        });

        if (!currentUser) return unauthorized();

        if (currentUser.twoFactorEnabled) {
            return success({ enabled: true });
        }

        // Generate new secret
        const { secret, uri } = generate2FASecret(currentUser.username);

        // Generate QR Code
        const qrCodeUrl = await QRCode.toDataURL(uri);

        await (db as NodePgDatabase<typeof schema>)
            .update(users)
            .set({
                twoFactorEnabled: false,
                twoFactorSecret: secret,
            })
            .where(eq(users.id, user.userId));

        return success({
            enabled: false,
            secret,
            qrCodeUrl
        });

    } catch (error) {
        logger.error({ err: error }, "Failed to generate 2FA");
        return serverError("Failed to generate 2FA configuration");
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const user = await getUserFromRequest(request);
        if (!user) return unauthorized();

        const body = await request.json();
        const { action, token, secret } = body;

        const db = getDatabase() as NodePgDatabase<typeof schema>;

        if (action === "enable") {
            if (!token) return badRequest("Authentication code is required");

            const currentUser = await db.query.users.findFirst({
                where: eq(users.id, user.userId)
            });
            if (!currentUser) return unauthorized();

            const effectiveSecret = currentUser.twoFactorSecret || secret;
            if (!effectiveSecret) return badRequest("No pending 2FA setup found");

            // Verify the token against server-side pending secret.
            // `secret` from request is accepted only as a compatibility fallback.
            const isValid = verify2FAToken(token, effectiveSecret);
            if (!isValid) return badRequest("Invalid authentication code");

            // Enable 2FA
            await db.update(users)
                .set({
                    twoFactorEnabled: true,
                    twoFactorSecret: effectiveSecret
                })
                .where(eq(users.id, user.userId));

            logger.info({ userId: user.userId }, "2FA enabled");
            return success({ message: "2FA enabled successfully" });
        }

        if (action === "disable") {
            if (!token) return badRequest("Authentication code required to disable 2FA");

            const currentUser = await db.query.users.findFirst({
                where: eq(users.id, user.userId)
            });

            if (!currentUser || !currentUser.twoFactorSecret) return badRequest("2FA not enabled");

            const isValid = verify2FAToken(token, currentUser.twoFactorSecret);
            if (!isValid) return badRequest("Invalid authentication code");

            await db.update(users)
                .set({
                    twoFactorEnabled: false,
                    twoFactorSecret: null
                })
                .where(eq(users.id, user.userId));

            logger.info({ userId: user.userId }, "2FA disabled");
            return success({ message: "2FA disabled successfully" });
        }

        return badRequest("Invalid action");

    } catch (error) {
        logger.error({ err: error }, "Failed to update 2FA settings");
        return serverError("Failed to update 2FA settings");
    }
};
