import { getDatabase } from "@/db";
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

        return success({ message: "Key deleted" });
    } catch (error) {
        console.error("Delete GPG key error:", error);
        return serverError("Failed to delete GPG key");
    }
};
