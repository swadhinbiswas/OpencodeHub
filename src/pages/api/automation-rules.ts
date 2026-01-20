/**
 * Automation Rules API
 * CRUD operations for workflow automation rules
 */

import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { withErrorHandler, Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { success, created, badRequest, unauthorized } from "@/lib/api";

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const GET: APIRoute = withErrorHandler(async ({ locals, url }) => {
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    const repoId = url.searchParams.get("repositoryId");
    if (!repoId) {
        return badRequest("repositoryId required");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const rules = await db.query.automationRules.findMany({
        where: eq(schema.automationRules.repositoryId, repoId),
    });

    return success({ rules });
});

export const POST: APIRoute = withErrorHandler(async ({ locals, request }) => {
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    const body = await request.json();
    const { repositoryId, name, description, trigger, conditions, actions } = body;

    if (!repositoryId || !name || !trigger || !actions) {
        return badRequest("Missing required fields");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const rule = {
        id: generateId(),
        repositoryId,
        createdById: user.id,
        name,
        description: description || null,
        trigger,
        conditions: conditions ? JSON.stringify(conditions) : null,
        actions: typeof actions === "string" ? actions : JSON.stringify(actions),
        isEnabled: true,
        priority: 0,
        runCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.insert(schema.automationRules).values(rule);

    logger.info({ ruleId: rule.id, userId: user.id, repositoryId }, "Automation rule created");

    return created({ rule });
});

export const PATCH: APIRoute = withErrorHandler(async ({ locals, request, url }) => {
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    const ruleId = url.searchParams.get("id");
    if (!ruleId) {
        return badRequest("Rule ID required");
    }

    const body = await request.json();
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const updates: Record<string, unknown> = {
        updatedAt: new Date(),
    };

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.trigger !== undefined) updates.trigger = body.trigger;
    if (body.conditions !== undefined) {
        updates.conditions = typeof body.conditions === "string"
            ? body.conditions
            : JSON.stringify(body.conditions);
    }
    if (body.actions !== undefined) {
        updates.actions = typeof body.actions === "string"
            ? body.actions
            : JSON.stringify(body.actions);
    }
    if (body.isEnabled !== undefined) updates.isEnabled = body.isEnabled;
    if (body.priority !== undefined) updates.priority = body.priority;

    await db
        .update(schema.automationRules)
        .set(updates)
        .where(eq(schema.automationRules.id, ruleId));

    logger.info({ ruleId, userId: user.id }, "Automation rule updated");

    return success({ success: true });
});

export const DELETE: APIRoute = withErrorHandler(async ({ locals, url }) => {
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    const ruleId = url.searchParams.get("id");
    if (!ruleId) {
        return badRequest("Rule ID required");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    await db
        .delete(schema.automationRules)
        .where(eq(schema.automationRules.id, ruleId));

    logger.info({ ruleId, userId: user.id }, "Automation rule deleted");

    return success({ success: true });
});
