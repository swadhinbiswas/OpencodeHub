
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { verify2FAToken, getUserFromRequest } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { unauthorized, success, serverError, badRequest } from "@/lib/api";

export const POST: APIRoute = async ({ request }) => {
    try {
        const userPayload = await getUserFromRequest(request);
        if (!userPayload) {
            return unauthorized();
        }

        const { token, secret } = await request.json();

        if (!token || !secret) {
            return badRequest("Token and secret are required");
        }

        // Verify token against the provided secret (which should match what we saved in DB, or we can trust client provided secret during setup flow before enabling)
        // Better security: fetches secret from DB.
        const db = getDatabase();
        const user = await db.query.users.findFirst({
            where: eq(schema.users.id, userPayload.userId)
        });

        if (!user) return unauthorized();

        // Check if the provided secret matches the one we stored tentatively (optional check)
        // Or just use the one from DB.
        const storedSecret = user.twoFactorSecret;
        if (!storedSecret) {
            return badRequest("2FA setup not initiated");
        }

        const isValid = verify2FAToken(token, storedSecret);

        if (isValid) {
            // Enable it
            await db.update(schema.users)
                .set({ twoFactorEnabled: true })
                .where(eq(schema.users.id, userPayload.userId));

            return success({ message: "2FA enabled successfully" });
        } else {
            return badRequest("Invalid authentication code");
        }

    } catch (error) {
        console.error("2FA Enable Error:", error);
        return serverError("Failed to enable 2FA");
    }
};
