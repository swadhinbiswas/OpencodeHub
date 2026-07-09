/**
 * Apply AI Suggestion API
 * Allows PR authors to apply suggested fixes from AI reviews
 */

import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseBody, success, badRequest, notFound, forbidden } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { applyAiSuggestion, canApplySuggestions } from "@/lib/suggestions";

const applyAiSchema = z.object({
    commitMessage: z.string().optional(),
});

// POST /api/repos/:owner/:repo/pulls/:pullNumber/ai-suggestions/:suggestionId/apply
export const POST: APIRoute = async (context) => {
    const { request, params } = context;
    const { owner, repo, pullNumber, suggestionId } = params;

    const user = await getUserFromRequest(request);
    if (!user) return new Response("Unauthorized", { status: 401 });

    try {
        const parsed = await parseBody(request, applyAiSchema);
        if ("error" in parsed) {
            return parsed.error;
        }

        const db = getDatabase() as NodePgDatabase<typeof schema>;

        // Get PR
        const pr = await db.query.pullRequests.findFirst({
            where: eq(schema.pullRequests.number, parseInt(pullNumber!)),
            with: {
                repository: {
                    with: {
                        owner: true,
                    },
                },
            },
        });

        if (!pr || pr.repository?.owner?.username !== owner || pr.repository?.name !== repo) {
            return notFound("Pull request not found");
        }

        // Check if user has permission to apply suggestions
        const canApply = await canApplySuggestions(user.userId, pr.id);
        if (!canApply) {
            return forbidden("You don't have permission to apply suggestions");
        }

        // Apply suggestion
        const result = await applyAiSuggestion(suggestionId!, user.userId);
        
        if (!result.success) {
            return badRequest(result.error || "Failed to apply suggestion");
        }

        return success({
            success: true,
            commitSha: result.commitSha,
            message: "Suggestion applied successfully",
        });

    } catch (e: any) {
        console.error("Apply AI suggestion error:", e);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
