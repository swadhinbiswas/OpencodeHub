
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
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

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

const createTokenSchema = z.object({
    name: z.string().min(1).max(100),
    expiresInDays: z.number().optional(), // 0 or null means 'No expiration'
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
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
    let expiresAt: Date | null = null;
    if (expiresInDays && expiresInDays > 0) {
        const date = new Date();
        date.setDate(date.getDate() + expiresInDays);
        expiresAt = date;
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const newToken = {
        id: generateId("pat"),
        userId: tokenPayload.userId,
        name,
        token, // Storing raw token as per simplified schema
        expiresAt,
        createdAt: new Date(),
    };

    await db.insert(personalAccessTokens).values(newToken);

    logger.info({ userId: tokenPayload.userId, tokenId: newToken.id }, "Personal Access Token created (legacy endpoint)");

    // Return the raw token to the user (only once!)
    return success(newToken);
});
