import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
    buildStoredAIConfig,
    mergeAIConfig,
    parseAIConfigFromStorage,
    sanitizeAIConfigForClient,
} from "@/lib/ai-config";

export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const data = await request.json();
        const { provider, apiKeys, model } = data;

        // Basic validation
        if (!["openai", "groq", "bytez", "local"].includes(provider)) {
            return new Response(JSON.stringify({ error: "Invalid provider" }), { status: 400 });
        }

        const db = getDatabase() as NodePgDatabase<typeof schema>;

        const currentUser = await db.query.users.findFirst({
            where: eq(schema.users.id, user.id),
            columns: { aiConfig: true },
        });

        const existing = parseAIConfigFromStorage(currentUser?.aiConfig);
        const merged = mergeAIConfig(existing, {
            provider,
            model: model || existing.model,
            apiKeys: {
                openai: typeof apiKeys?.openai === "string" && apiKeys.openai.trim() !== "" ? apiKeys.openai.trim() : undefined,
                groq: typeof apiKeys?.groq === "string" && apiKeys.groq.trim() !== "" ? apiKeys.groq.trim() : undefined,
                bytez: typeof apiKeys?.bytez === "string" && apiKeys.bytez.trim() !== "" ? apiKeys.bytez.trim() : undefined,
            },
        });

        await db.update(schema.users)
            .set({
                aiConfig: buildStoredAIConfig(merged),
                updatedAt: new Date()
            })
            .where(eq(schema.users.id, user.id));

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

export const GET: APIRoute = async ({ locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    let config = null;
    try {
        if (user.aiConfig) {
            config = sanitizeAIConfigForClient(parseAIConfigFromStorage(user.aiConfig));
        }
    } catch (e) { }

    return new Response(JSON.stringify({ config }), { status: 200 });
}
