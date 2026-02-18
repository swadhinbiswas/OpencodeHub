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
        if (!["openai", "groq", "bytez", "openrouter", "together", "google", "external_agent", "local", "anthropic"].includes(provider)) {
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
                anthropic: typeof apiKeys?.anthropic === "string" && apiKeys.anthropic.trim() !== "" ? apiKeys.anthropic.trim() : undefined,
                groq: typeof apiKeys?.groq === "string" && apiKeys.groq.trim() !== "" ? apiKeys.groq.trim() : undefined,
                bytez: typeof apiKeys?.bytez === "string" && apiKeys.bytez.trim() !== "" ? apiKeys.bytez.trim() : undefined,
                openrouter: typeof apiKeys?.openrouter === "string" && apiKeys.openrouter.trim() !== "" ? apiKeys.openrouter.trim() : undefined,
                together: typeof apiKeys?.together === "string" && apiKeys.together.trim() !== "" ? apiKeys.together.trim() : undefined,
                google: typeof apiKeys?.google === "string" && apiKeys.google.trim() !== "" ? apiKeys.google.trim() : undefined,
                externalAgent: typeof apiKeys?.externalAgent === "string" && apiKeys.externalAgent.trim() !== "" ? apiKeys.externalAgent.trim() : undefined,
            },
            externalAgentWebhookUrl:
                typeof data?.externalAgentWebhookUrl === "string" && data.externalAgentWebhookUrl.trim() !== ""
                    ? data.externalAgentWebhookUrl.trim()
                    : undefined,
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
