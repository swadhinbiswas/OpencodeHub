
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { unauthorized, success, serverError } from "@/lib/api";

export const POST: APIRoute = async ({ request }) => {
    try {
        const userPayload = await getUserFromRequest(request);
        if (!userPayload) {
            return unauthorized();
        }

        const db = getDatabase();

        // In a real app, we might require a password or 2FA token to disable 2FA.
        // For now, we will just disable it.

        await db.update(schema.users)
            .set({
                twoFactorEnabled: false,
                twoFactorSecret: null
            })
            .where(eq(schema.users.id, userPayload.userId));

        return success({ message: "2FA disabled successfully" });

    } catch (error) {
        console.error("2FA Disable Error:", error);
        return serverError("Failed to disable 2FA");
    }
};
