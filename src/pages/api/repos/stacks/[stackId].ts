/**
 * Single Stack API - Get, Update, Delete Stack
 */

import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getStack, reorderStack } from "@/lib/stacks";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, serverError, success } from "@/lib/api";

// ... existing imports ...

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        return unauthorized();
    }

    const { stackId } = params;
    if (!stackId) {
        return badRequest("Missing stackId");
    }

    const stackInfo = await getStack(stackId);

    if (!stackInfo) {
        return notFound("Stack not found");
    }

    return success({
        stack: {
            id: stackInfo.stack.id,
            name: stackInfo.stack.name,
            baseBranch: stackInfo.stack.baseBranch,
            status: stackInfo.stack.status,
            createdAt: stackInfo.stack.createdAt,
            updatedAt: stackInfo.stack.updatedAt,
        },
        entries: stackInfo.entries.map(({ entry, pr }) => ({
            id: entry.id,
            order: entry.stackOrder,
            parentPrId: entry.parentPrId,
            pr: {
                id: pr.id,
                number: pr.number,
                title: pr.title,
                state: pr.state,
                isDraft: pr.isDraft,
                headBranch: pr.headBranch,
                baseBranch: pr.baseBranch,
                isMerged: pr.isMerged,
                additions: pr.additions,
                deletions: pr.deletions,
                changedFiles: pr.changedFiles,
                reviewCount: pr.reviewCount,
            },
        })),
    });
});

export const PATCH: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
    const user = locals.user;
    if (!user) {
        return unauthorized();
    }

    const { stackId } = params;
    if (!stackId) {
        return badRequest("Missing stackId");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const body = await request.json();
    const { name, order } = body;

    // Update name if provided
    if (name !== undefined) {
        await db.update(schema.prStacks)
            .set({ name, updatedAt: new Date() })
            .where(eq(schema.prStacks.id, stackId));
    }

    // Reorder if provided
    if (order && Array.isArray(order)) {
        await reorderStack(stackId, order);
    }

    // Get updated stack
    const stackInfo = await getStack(stackId);

    logger.info({ userId: user.id, stackId, updates: { name, order: order ? "updated" : undefined } }, "Stack updated");

    return success({
        success: true,
        stack: stackInfo,
    });
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        return unauthorized();
    }

    const { stackId } = params;
    if (!stackId) {
        return badRequest("Missing stackId");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Delete all entries first (cascade should handle this, but be explicit)
    await db.delete(schema.prStackEntries)
        .where(eq(schema.prStackEntries.stackId, stackId));

    // Delete the stack
    await db.delete(schema.prStacks)
        .where(eq(schema.prStacks.id, stackId));

    logger.info({ userId: user.id, stackId }, "Stack deleted");

    return success({ success: true });
});
