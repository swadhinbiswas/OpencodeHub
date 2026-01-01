
import { getDatabase } from "@/db";
import { personalAccessTokens } from "@/db/schema";
import {
    parseBody,
    serverError,
    success,
    unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { generateId, now } from "@/lib/utils";
import type { APIRoute } from "astro";
import crypto from "crypto";
import { z } from "zod";

const createTokenSchema = z.object({
    name: z.string().min(1).max(100),
    expiresInDays: z.number().optional(), // 0 or null means 'No expiration'
});

export const POST: APIRoute = async ({ request }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const parsed = await parseBody(request, createTokenSchema);
        if ("error" in parsed) return parsed.error;

        const { name, expiresInDays } = parsed.data;

        // Generate token
        const token = `och_${crypto.randomBytes(24).toString("hex")}`;

        // Calculate expiry
        let expiresAt: string | null = null;
        if (expiresInDays && expiresInDays > 0) {
            const date = new Date();
            date.setDate(date.getDate() + expiresInDays);
            expiresAt = date.toISOString();
        }

        const db = getDatabase();

        const newToken = {
            id: generateId("pat"),
            userId: tokenPayload.userId,
            name,
            token, // Storing raw token as per simplified schema
            expiresAt,
            createdAt: now(),
        };

        await db.insert(personalAccessTokens).values(newToken);

        // Return the raw token to the user (only once!)
        return success(newToken);
    } catch (error) {
        console.error("Create Access Token error:", error);
        return serverError("Failed to create access token");
    }
};
