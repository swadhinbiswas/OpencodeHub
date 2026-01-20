/**
 * AI Review Rules PATCH/DELETE API
 * Update and delete operations for custom AI review rules
 */

import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";

export const PATCH: APIRoute = async ({ locals, request, params }) => {
    const user = locals.user;

    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    const ruleId = params.id;
    if (!ruleId) {
        return new Response(JSON.stringify({ error: "Rule ID required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const body = await request.json();
        const db = getDatabase() as NodePgDatabase<typeof schema>;

        const updates: Record<string, unknown> = {
            updatedAt: new Date(),
        };

        if (body.name !== undefined) updates.name = body.name;
        if (body.description !== undefined) updates.description = body.description;
        if (body.ruleType !== undefined) updates.ruleType = body.ruleType;
        if (body.aiPrompt !== undefined) updates.aiPrompt = body.aiPrompt;
        if (body.regexPattern !== undefined) updates.regexPattern = body.regexPattern;
        if (body.severity !== undefined) updates.severity = body.severity;
        if (body.category !== undefined) updates.category = body.category;
        if (body.fileGlobs !== undefined) updates.fileGlobs = body.fileGlobs;
        if (body.isEnabled !== undefined) updates.isEnabled = body.isEnabled;

        await db
            .update(schema.aiReviewRules)
            .set(updates)
            .where(eq(schema.aiReviewRules.id, ruleId));

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to update rule" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
    const user = locals.user;

    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    const ruleId = params.id;
    if (!ruleId) {
        return new Response(JSON.stringify({ error: "Rule ID required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const db = getDatabase() as NodePgDatabase<typeof schema>;
        await db
            .delete(schema.aiReviewRules)
            .where(eq(schema.aiReviewRules.id, ruleId));

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to delete rule" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
