/**
 * Stacked PRs Library
 * Core functions for managing stacked pull request workflows
 */

import { eq, and, asc, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { generateId } from "./utils";

// Types
export interface StackInfo {
    stack: typeof schema.prStacks.$inferSelect;
    entries: Array<{
        entry: typeof schema.prStackEntries.$inferSelect;
        pr: typeof schema.pullRequests.$inferSelect;
    }>;
}

export interface CreateStackOptions {
    repositoryId: string;
    baseBranch: string;
    name?: string;
    createdById: string;
}

export interface AddToStackOptions {
    stackId: string;
    pullRequestId: string;
    parentPrId?: string;
}

/**
 * Create a new PR stack
 */
export async function createStack(options: CreateStackOptions): Promise<typeof schema.prStacks.$inferSelect> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const id = generateId();

    const stack = {
        id,
        repositoryId: options.repositoryId,
        baseBranch: options.baseBranch,
        name: options.name || null,
        status: "active",
        createdById: options.createdById,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.insert(schema.prStacks).values(stack);
    return stack as typeof schema.prStacks.$inferSelect;
}

/**
 * Get stack by ID with all entries and PRs
 */
export async function getStack(stackId: string): Promise<StackInfo | null> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const stack = await db.query.prStacks.findFirst({
        where: eq(schema.prStacks.id, stackId),
    });

    if (!stack) return null;

    const entries = await db.query.prStackEntries.findMany({
        where: eq(schema.prStackEntries.stackId, stackId),
        orderBy: [asc(schema.prStackEntries.stackOrder)],
    });

    const entriesWithPrs = await Promise.all(
        entries.map(async (entry) => {
            const pr = await db.query.pullRequests.findFirst({
                where: eq(schema.pullRequests.id, entry.pullRequestId),
            });
            return { entry, pr: pr! };
        })
    );

    return { stack, entries: entriesWithPrs };
}

/**
 * Get stack for a specific PR
 */
export async function getStackForPr(pullRequestId: string): Promise<StackInfo | null> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const entry = await db.query.prStackEntries.findFirst({
        where: eq(schema.prStackEntries.pullRequestId, pullRequestId),
    });

    if (!entry) return null;

    return getStack(entry.stackId);
}

/**
 * Add a PR to an existing stack
 */
export async function addToStack(options: AddToStackOptions): Promise<typeof schema.prStackEntries.$inferSelect> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get current max order in stack
    const existingEntries = await db.query.prStackEntries.findMany({
        where: eq(schema.prStackEntries.stackId, options.stackId),
        orderBy: [desc(schema.prStackEntries.stackOrder)],
    });

    const maxOrder = existingEntries.length > 0 ? existingEntries[0].stackOrder : 0;

    const entry = {
        id: generateId(),
        stackId: options.stackId,
        pullRequestId: options.pullRequestId,
        stackOrder: maxOrder + 1,
        parentPrId: options.parentPrId || (existingEntries[0]?.pullRequestId || null),
        createdAt: new Date(),
    };

    await db.insert(schema.prStackEntries).values(entry);

    // Update stack timestamp
    await db.update(schema.prStacks)
        .set({ updatedAt: new Date() })
        .where(eq(schema.prStacks.id, options.stackId));

    return entry as typeof schema.prStackEntries.$inferSelect;
}

/**
 * Remove a PR from its stack
 */
export async function removeFromStack(pullRequestId: string): Promise<void> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const entry = await db.query.prStackEntries.findFirst({
        where: eq(schema.prStackEntries.pullRequestId, pullRequestId),
    });

    if (!entry) return;

    // Delete the entry
    await db.delete(schema.prStackEntries)
        .where(eq(schema.prStackEntries.pullRequestId, pullRequestId));

    // Update order of remaining entries
    const remainingEntries = await db.query.prStackEntries.findMany({
        where: eq(schema.prStackEntries.stackId, entry.stackId),
        orderBy: [asc(schema.prStackEntries.stackOrder)],
    });

    // Re-number and update parent references
    for (let i = 0; i < remainingEntries.length; i++) {
        const parentPrId = i > 0 ? remainingEntries[i - 1].pullRequestId : null;
        await db.update(schema.prStackEntries)
            .set({ stackOrder: i + 1, parentPrId })
            .where(eq(schema.prStackEntries.id, remainingEntries[i].id));
    }

    // If stack is now empty, mark it as closed
    if (remainingEntries.length === 0) {
        await db.update(schema.prStacks)
            .set({ status: "closed", updatedAt: new Date() })
            .where(eq(schema.prStacks.id, entry.stackId));
    }
}

/**
 * Reorder PRs within a stack
 */
export async function reorderStack(stackId: string, newOrder: string[]): Promise<void> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    for (let i = 0; i < newOrder.length; i++) {
        const parentPrId = i > 0 ? newOrder[i - 1] : null;

        await db.update(schema.prStackEntries)
            .set({ stackOrder: i + 1, parentPrId })
            .where(
                and(
                    eq(schema.prStackEntries.stackId, stackId),
                    eq(schema.prStackEntries.pullRequestId, newOrder[i])
                )
            );
    }

    await db.update(schema.prStacks)
        .set({ updatedAt: new Date() })
        .where(eq(schema.prStacks.id, stackId));
}

/**
 * Get all active stacks for a repository
 */
export async function getRepositoryStacks(repositoryId: string): Promise<Array<StackInfo>> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const stacks = await db.query.prStacks.findMany({
        where: and(
            eq(schema.prStacks.repositoryId, repositoryId),
            eq(schema.prStacks.status, "active")
        ),
        orderBy: [desc(schema.prStacks.updatedAt)],
    });

    const stackInfos = await Promise.all(
        stacks.map(async (stack) => {
            const info = await getStack(stack.id);
            return info!;
        })
    );

    return stackInfos.filter(Boolean);
}

/**
 * Check if a PR can be stacked on another PR
 */
export async function canStackOn(prId: string, targetPrId: string): Promise<boolean> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const targetPr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, targetPrId),
    });

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prId),
    });

    if (!targetPr || !pr) return false;

    // Must be same repository
    if (pr.repositoryId !== targetPr.repositoryId) return false;

    // Target must be open
    if (targetPr.state !== "open") return false;

    // Can't stack on itself
    if (prId === targetPrId) return false;

    return true;
}

/**
 * Get visualization data for a stack (for UI rendering)
 */
export async function getStackVisualization(stackId: string) {
    const stackInfo = await getStack(stackId);
    if (!stackInfo) return null;

    return {
        id: stackInfo.stack.id,
        name: stackInfo.stack.name,
        baseBranch: stackInfo.stack.baseBranch,
        status: stackInfo.stack.status,
        entries: stackInfo.entries.map(({ entry, pr }) => ({
            order: entry.stackOrder,
            pr: {
                id: pr.id,
                number: pr.number,
                title: pr.title,
                state: pr.state,
                isDraft: pr.isDraft,
                headBranch: pr.headBranch,
                isMerged: pr.isMerged,
            },
            parentPrId: entry.parentPrId,
        })),
    };
}

/**
 * Mark a stack as merged when all PRs are merged
 */
export async function updateStackStatus(stackId: string): Promise<void> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const stackInfo = await getStack(stackId);

    if (!stackInfo) return;

    const allMerged = stackInfo.entries.every(({ pr }) => pr.isMerged);
    const anyClosed = stackInfo.entries.some(({ pr }) => pr.state === "closed" && !pr.isMerged);

    let newStatus = "active";
    if (allMerged) {
        newStatus = "merged";
    } else if (anyClosed) {
        newStatus = "closed";
    }

    if (newStatus !== stackInfo.stack.status) {
        await db.update(schema.prStacks)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(schema.prStacks.id, stackId));
    }
}
