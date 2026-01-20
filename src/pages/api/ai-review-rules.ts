/**
 * AI Review Rules API
 * CRUD operations for custom AI review rules
 */

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { withErrorHandler, Errors } from "@/lib/errors";
import { success, created } from "@/lib/api";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const GET: APIRoute = withErrorHandler(async ({ locals, url }) => {
    const user = locals.user;

    if (!user) {
        throw Errors.unauthorized();
    }

    const repoId = url.searchParams.get("repositoryId");

    const db = getDatabase() as NodePgDatabase<typeof schema>; // Casted db

    if (repoId) {
        const rules = await db.query.aiReviewRules.findMany({
            where: eq(schema.aiReviewRules.repositoryId, repoId),
        });
        return success({ rules });
    }

    // Get templates if no repo specified
    const templates = await db.query.aiReviewRuleTemplates.findMany({
        where: eq(schema.aiReviewRuleTemplates.isBuiltIn, true),
    });

    return success({ templates });
});

export const POST: APIRoute = withErrorHandler(async ({ locals, request }) => {
    const user = locals.user;

    if (!user) {
        throw Errors.unauthorized();
    }

    const body = await request.json();
    const {
        repositoryId,
        name,
        description,
        ruleType,
        aiPrompt,
        regexPattern,
        severity,
        category,
        fileGlobs,
        isEnabled,
    } = body;

    if (!repositoryId || !name || !ruleType || !severity) {
        throw Errors.badRequest("Missing required fields");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>; // Casted db

    const rule = {
        id: generateId(),
        repositoryId,
        createdById: user.id,
        name,
        description: description || null,
        ruleType,
        aiPrompt: aiPrompt || null,
        regexPattern: regexPattern || null,
        severity,
        category: category || null,
        fileGlobs: fileGlobs || null,
        isEnabled: isEnabled !== false,
        priority: 0,
        matchCount: 0,
        createdAt: new Date(), // Changed to Date object
        updatedAt: new Date(), // Changed to Date object
    };

    await db.insert(schema.aiReviewRules).values(rule);

    logger.info({ ruleId: rule.id, userId: user.id, repositoryId }, "AI review rule created");

    return created({ rule });
});
