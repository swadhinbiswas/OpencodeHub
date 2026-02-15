
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { generateId } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

const createTokenSchema = z.object({
    name: z.string().min(1).max(100),
    expiresIn: z.number().int().optional(), // Days, optional
});

export const GET: APIRoute = async ({ request }) => {
    const user = await getUserFromRequest(request);
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const tokens = await db.query.personalAccessTokens.findMany({
        where: eq(schema.personalAccessTokens.userId, user.userId),
        orderBy: (tokens, { desc }) => [desc(tokens.createdAt)],
    });

    // Mask tokens
    const maskedTokens = tokens.map(t => ({
        ...t,
        token: `och_${"•".repeat(20)}${t.token.slice(-4)}`,
    }));

    return new Response(JSON.stringify({ tokens: maskedTokens }), {
        headers: { "Content-Type": "application/json" },
    });
};

export const POST: APIRoute = async ({ request }) => {
    const user = await getUserFromRequest(request);
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const body = await request.json();
        const result = createTokenSchema.safeParse(body);

        if (!result.success) {
            return new Response(JSON.stringify({ error: "Invalid input", details: result.error }), { status: 400 });
        }

        const { name, expiresIn } = result.data;
        const token = `och_${generateId()}${generateId()}`; // Long random string
        const db = getDatabase() as NodePgDatabase<typeof schema>;

        let expiresAt = null;
        if (expiresIn) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + expiresIn);
        }

        await db.insert(schema.personalAccessTokens).values({
            id: generateId("pat"),
            userId: user.userId,
            name,
            token,
            expiresAt,
            createdAt: new Date(),
        });

        // Return FULL token only once
        return new Response(JSON.stringify({ token, name, expiresAt }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to create token" }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ request }) => {
    const user = await getUserFromRequest(request);
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const url = new URL(request.url);
    const tokenId = url.searchParams.get("id");

    if (!tokenId) {
        return new Response(JSON.stringify({ error: "Missing token ID" }), { status: 400 });
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Verify ownership
    const token = await db.query.personalAccessTokens.findFirst({
        where: and(
            eq(schema.personalAccessTokens.id, tokenId),
            eq(schema.personalAccessTokens.userId, user.userId)
        ),
    });

    if (!token) {
        return new Response(JSON.stringify({ error: "Token not found" }), { status: 404 });
    }

    await db.delete(schema.personalAccessTokens).where(eq(schema.personalAccessTokens.id, tokenId));

    return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
    });
};
