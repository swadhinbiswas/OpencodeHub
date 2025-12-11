
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { generate2FASecret, getUserFromRequest } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { unauthorized, success, serverError } from "@/lib/api";

export const POST: APIRoute = async ({ request }) => {
    try {
        const userPayload = await getUserFromRequest(request);
        if (!userPayload) {
            return unauthorized();
        }

        // Generate secret
        const { secret, uri } = generate2FASecret(userPayload.username);

        // Save secret to DB (temporarily or pending verification)
        // Actually, we usually save it to `twoFactorSecret` but user.twoFactorEnabled remains false until verified.
        const db = getDatabase();
        await db
            .update(schema.users)
            .set({ twoFactorSecret: secret }) // Store secret, but don't enable it yet
            .where(eq(schema.users.id, userPayload.userId));

        return success({ secret, uri });
    } catch (error) {
        console.error("2FA Setup Error:", error);
        return serverError("Failed to initiate 2FA setup");
    }
};
