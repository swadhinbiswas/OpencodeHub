/**
 * Single Stack API - Get, Update, Delete Stack
 */

import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getStack, reorderStack, removeFromStack, updateStackStatus } from "@/lib/stacks";

export const GET: APIRoute = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { stackId } = params;
    if (!stackId) {
        return new Response(JSON.stringify({ error: "Missing stackId" }), { status: 400 });
    }

    try {
        const stackInfo = await getStack(stackId);

        if (!stackInfo) {
            return new Response(JSON.stringify({ error: "Stack not found" }), { status: 404 });
        }

        return new Response(JSON.stringify({
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
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error fetching stack:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch stack" }), { status: 500 });
    }
};

export const PATCH: APIRoute = async ({ params, locals, request }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { stackId } = params;
    if (!stackId) {
        return new Response(JSON.stringify({ error: "Missing stackId" }), { status: 400 });
    }

    const db = getDatabase();

    try {
        const body = await request.json();
        const { name, order } = body;

        // Update name if provided
        if (name !== undefined) {
            await db.update(schema.prStacks)
                .set({ name, updatedAt: new Date().toISOString() })
                .where(eq(schema.prStacks.id, stackId));
        }

        // Reorder if provided
        if (order && Array.isArray(order)) {
            await reorderStack(stackId, order);
        }

        // Get updated stack
        const stackInfo = await getStack(stackId);

        return new Response(JSON.stringify({
            success: true,
            stack: stackInfo,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error updating stack:", error);
        return new Response(JSON.stringify({ error: "Failed to update stack" }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { stackId } = params;
    if (!stackId) {
        return new Response(JSON.stringify({ error: "Missing stackId" }), { status: 400 });
    }

    const db = getDatabase();

    try {
        // Delete all entries first (cascade should handle this, but be explicit)
        await db.delete(schema.prStackEntries)
            .where(eq(schema.prStackEntries.stackId, stackId));

        // Delete the stack
        await db.delete(schema.prStacks)
            .where(eq(schema.prStacks.id, stackId));

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error deleting stack:", error);
        return new Response(JSON.stringify({ error: "Failed to delete stack" }), { status: 500 });
    }
};
