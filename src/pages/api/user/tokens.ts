/**
 * Personal Access Tokens API
 * Create, list, and revoke tokens for CLI authentication
 */

import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { personalAccessTokens } from "@/db/schema/users";
import { getUserFromRequest } from "@/lib/auth";
import { parseBody, unauthorized, badRequest, notFound, success, serverError } from "@/lib/api";
import { z } from "zod";
import crypto from "crypto";
import { hashPersonalAccessToken, getTokenPrefixForDisplay } from "@/lib/personal-access-token";

// Generate a secure token like GitHub's format: ochat_xxxxxxxxxxxx
function generateToken(): { token: string; prefix: string } {
    const prefix = "och_";
    const randomPart = crypto.randomBytes(32).toString("base64url");
    return {
        token: `${prefix}${randomPart}`,
        prefix: `${prefix}${randomPart.slice(0, 8)}`,
    };
}

const createTokenSchema = z.object({
    name: z.string().min(1).max(100),
    expiresIn: z.enum(["7d", "30d", "90d", "1y", "never"]).optional().default("30d"),
    scopes: z.array(z.string()).optional().default(["repo", "user"]),
});

import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

// ... existing imports ...

// GET /api/user/tokens - List user's tokens
export const GET: APIRoute = withErrorHandler(async ({ request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const tokens = await db.query.personalAccessTokens.findMany({
        where: eq(personalAccessTokens.userId, tokenPayload.userId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    // Return tokens without the actual token value (only prefix stored after creation)
    return success({
        tokens: tokens.map((t) => ({
            id: t.id,
            name: t.name,
            tokenPrefix: getTokenPrefixForDisplay(t.token),
            expiresAt: t.expiresAt,
            lastUsedAt: t.lastUsedAt,
            createdAt: t.createdAt,
        })),
    });
});

// POST /api/user/tokens - Create new token
export const POST: APIRoute = withErrorHandler(async ({ request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const parsed = await parseBody(request, createTokenSchema);
    if ("error" in parsed) return parsed.error;

    const { name, expiresIn, scopes } = parsed.data;

    // Calculate expiry date
    let expiresAt: Date | null = null;
    if (expiresIn !== "never") {
        const now = new Date();
        switch (expiresIn) {
            case "7d":
                now.setDate(now.getDate() + 7);
                break;
            case "30d":
                now.setDate(now.getDate() + 30);
                break;
            case "90d":
                now.setDate(now.getDate() + 90);
                break;
            case "1y":
                now.setFullYear(now.getFullYear() + 1);
                break;
        }
        expiresAt = now;
    }

    // Generate token
    const { token, prefix } = generateToken();
    const tokenId = `pat_${crypto.randomBytes(8).toString("hex")}`;

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Store the full token (we'll show it once, then never again)
    // In production, you'd hash this and only store the hash
    await db.insert(personalAccessTokens).values({
        id: tokenId,
        userId: tokenPayload.userId,
        name,
        token: hashPersonalAccessToken(token),
        expiresAt,
        createdAt: new Date(),
    });

    logger.info({ userId: tokenPayload.userId, tokenId }, "Personal Access Token created");

    return success({
        message: "Token created successfully",
        token: {
            id: tokenId,
            name,
            // IMPORTANT: This is the only time the full token is shown
            token: token,
            expiresAt,
            createdAt: new Date(),
        },
        warning: "Make sure to copy your token now. You won't be able to see it again!",
    });
});

// DELETE /api/user/tokens - Delete a token
export const DELETE: APIRoute = withErrorHandler(async ({ request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const url = new URL(request.url);
    const tokenId = url.searchParams.get("id");

    if (!tokenId) {
        return badRequest("Token ID required");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Verify token belongs to user
    const existingToken = await db.query.personalAccessTokens.findFirst({
        where: eq(personalAccessTokens.id, tokenId),
    });

    if (!existingToken) {
        return notFound("Token not found");
    }

    if (existingToken.userId !== tokenPayload.userId) {
        return unauthorized("Not your token");
    }

    await db.delete(personalAccessTokens).where(eq(personalAccessTokens.id, tokenId));

    logger.info({ userId: tokenPayload.userId, tokenId }, "Personal Access Token revoked");

    return success({ message: "Token deleted" });
});
