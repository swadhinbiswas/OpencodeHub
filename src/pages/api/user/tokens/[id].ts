import { getDatabase } from "@/db";
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

export const DELETE: APIRoute = async ({ request, params }) => {
    try {
        const { id } = params;
        if (!id) return badRequest("Missing ID");

        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const db = getDatabase();

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

        return success({ message: "Token deleted" });
    } catch (error) {
        console.error("Delete access token error:", error);
        return serverError("Failed to delete access token");
    }
};
