/**
 * Merge Queue Library
 * Stack-aware merge queue with CI optimization
 */

import { eq, and, asc, desc, lt, gt } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { generateId } from "./utils";
import { getStack, getStackForPr } from "./stacks";
import { recordPrMetrics } from "./developer-metrics";

// Types
export interface MergeQueueItem {
    entry: typeof schema.mergeQueue.$inferSelect;
    pr: typeof schema.pullRequests.$inferSelect;
    stack?: {
        id: string;
        name: string | null;
        entries: Array<{
            prNumber: number;
            prState: string;
            isMerged: boolean;
        }>;
    };
}

export interface AddToQueueOptions {
    repositoryId: string;
    pullRequestId: string;
    addedById: string;
    priority?: number;
    mergeMethod?: "merge" | "squash" | "rebase";
}

/**
 * Add a PR to the merge queue
 */
export async function addToMergeQueue(options: AddToQueueOptions): Promise<typeof schema.mergeQueue.$inferSelect> {
    const db = getDatabase();

    // Check if already in queue
    const existing = await db.query.mergeQueue.findFirst({
        where: and(
            eq(schema.mergeQueue.pullRequestId, options.pullRequestId),
            eq(schema.mergeQueue.status, "pending")
        ),
    });

    if (existing) {
        throw new Error("PR is already in the merge queue");
    }

    // Get current max position
    const queueItems = await db.query.mergeQueue.findMany({
        where: and(
            eq(schema.mergeQueue.repositoryId, options.repositoryId),
            eq(schema.mergeQueue.status, "pending")
        ),
        orderBy: [desc(schema.mergeQueue.position)],
        limit: 1,
    });

    const maxPosition = queueItems.length > 0 ? (queueItems[0].position || 0) : 0;

    // Check if PR is part of a stack
    const stackInfo = await getStackForPr(options.pullRequestId);

    const entry = {
        id: generateId(),
        repositoryId: options.repositoryId,
        pullRequestId: options.pullRequestId,
        stackId: stackInfo?.stack.id || null,
        status: "pending",
        priority: options.priority || 0,
        position: maxPosition + 1,
        ciStatus: "pending",
        addedById: options.addedById,
        addedAt: new Date().toISOString(),
        mergeMethod: options.mergeMethod || "merge",
        deleteOnMerge: true,
    };

    await db.insert(schema.mergeQueue).values(entry);

    return entry as typeof schema.mergeQueue.$inferSelect;
}

/**
 * Remove a PR from the merge queue
 */
export async function removeFromMergeQueue(pullRequestId: string): Promise<void> {
    const db = getDatabase();

    await db.delete(schema.mergeQueue)
        .where(eq(schema.mergeQueue.pullRequestId, pullRequestId));
}

/**
 * Get the merge queue for a repository
 */
export async function getMergeQueue(repositoryId: string): Promise<MergeQueueItem[]> {
    const db = getDatabase();

    const queueEntries = await db.query.mergeQueue.findMany({
        where: and(
            eq(schema.mergeQueue.repositoryId, repositoryId),
            eq(schema.mergeQueue.status, "pending")
        ),
        orderBy: [desc(schema.mergeQueue.priority), asc(schema.mergeQueue.position)],
    });

    const items: MergeQueueItem[] = [];

    for (const entry of queueEntries) {
        const pr = await db.query.pullRequests.findFirst({
            where: eq(schema.pullRequests.id, entry.pullRequestId),
        });

        if (!pr) continue;

        let stack = undefined;
        if (entry.stackId) {
            const stackInfo = await getStack(entry.stackId);
            if (stackInfo) {
                stack = {
                    id: stackInfo.stack.id,
                    name: stackInfo.stack.name,
                    entries: stackInfo.entries.map(e => ({
                        prNumber: e.pr.number,
                        prState: e.pr.state,
                        isMerged: e.pr.isMerged || false,
                    })),
                };
            }
        }

        items.push({ entry, pr, stack });
    }

    return items;
}

/**
 * Check if a PR can be merged (all parent PRs in stack must be merged first)
 */
export async function canMerge(pullRequestId: string): Promise<{ canMerge: boolean; reason?: string }> {
    const db = getDatabase();

    // Get the PR
    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, pullRequestId),
    });

    if (!pr) {
        return { canMerge: false, reason: "PR not found" };
    }

    if (pr.state !== "open") {
        return { canMerge: false, reason: "PR is not open" };
    }

    if (pr.isMerged) {
        return { canMerge: false, reason: "PR is already merged" };
    }

    // Check if part of a stack
    const stackInfo = await getStackForPr(pullRequestId);

    if (stackInfo) {
        // Find this PR's position in the stack
        const prEntry = stackInfo.entries.find(e => e.pr.id === pullRequestId);
        if (prEntry && prEntry.entry.parentPrId) {
            // Check if parent is merged
            const parentPr = await db.query.pullRequests.findFirst({
                where: eq(schema.pullRequests.id, prEntry.entry.parentPrId),
            });

            if (parentPr && !parentPr.isMerged) {
                return {
                    canMerge: false,
                    reason: `Parent PR #${parentPr.number} must be merged first`
                };
            }
        }
    }

    // Check local CI status (using workflow_runs table)
    // We want the latest run for this PR's head SHA
    const latestRun = await db.query.workflowRuns.findFirst({
        where: and(
            eq(schema.workflowRuns.pullRequestId, pr.id),
            eq(schema.workflowRuns.headSha, pr.headSha) // Ensure it's for the latest commit
            // eq(schema.workflowRuns.headBranch, pr.headBranch) // Optional extra check
        ),
        orderBy: (runs, { desc }) => [desc(runs.createdAt)],
    });

    if (latestRun && latestRun.status !== "success") {
        if (latestRun.status === "running" || latestRun.status === "queued") {
            return { canMerge: false, reason: "CI is still running" };
        }
        if (latestRun.status === "failed") {
            return { canMerge: false, reason: "CI checks failed" };
        }
    }

    // Check Branch Protection Rules
    const rules = await db.query.branchProtection.findMany({
        where: and(
            eq(schema.branchProtection.repositoryId, pr.repositoryId),
            eq(schema.branchProtection.active, true)
        )
    });

    const matchingRule = rules.find(rule => {
        if (rule.pattern === pr.baseBranch) return true;
        if (rule.pattern.endsWith("*")) {
            return pr.baseBranch.startsWith(rule.pattern.slice(0, -1));
        }
        return false;
    });

    // Default required approvals to 0 unless protected.
    // If protected but requiredApprovals is null (shouldn't happen with default), use 1.
    const requiredApprovals = matchingRule ? (matchingRule.requiredApprovals ?? 1) : 0;

    // Check for approvals
    const approvals = await db.query.pullRequestReviews.findMany({
        where: and(
            eq(schema.pullRequestReviews.pullRequestId, pr.id),
            eq(schema.pullRequestReviews.state, "approved")
        ),
    });

    if (approvals.length < requiredApprovals) {
        return {
            canMerge: false,
            reason: `At least ${requiredApprovals} approval(s) required (has ${approvals.length})`
        };
    }

    // Check for blocking reviews (changes requested)
    // Branch protection might enforce "Dismiss stale reviews" but here we just check current state
    const blockingReviews = await db.query.pullRequestReviews.findMany({
        where: and(
            eq(schema.pullRequestReviews.pullRequestId, pr.id),
            eq(schema.pullRequestReviews.state, "changes_requested")
        ),
    });

    if (blockingReviews.length > 0) {
        return { canMerge: false, reason: "Changes requested by reviewer" };
    }

    return { canMerge: true };
}

/**
 * Process the next item in the merge queue
 */
export async function processNextInQueue(repositoryId: string): Promise<{
    processed: boolean;
    entry?: typeof schema.mergeQueue.$inferSelect;
    reason?: string;
}> {
    const db = getDatabase();

    // Get next item to process
    const nextItem = await db.query.mergeQueue.findFirst({
        where: and(
            eq(schema.mergeQueue.repositoryId, repositoryId),
            eq(schema.mergeQueue.status, "pending")
        ),
        orderBy: [desc(schema.mergeQueue.priority), asc(schema.mergeQueue.position)],
    });

    if (!nextItem) {
        return { processed: false, reason: "Queue is empty" };
    }

    // Check if it can be merged
    const mergeCheck = await canMerge(nextItem.pullRequestId);

    if (!mergeCheck.canMerge) {
        // Skip this item and try next
        await db.update(schema.mergeQueue)
            .set({ status: "failed", failureReason: mergeCheck.reason })
            .where(eq(schema.mergeQueue.id, nextItem.id));

        return { processed: false, entry: nextItem, reason: mergeCheck.reason };
    }

    // Get the PR and repo
    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, nextItem.pullRequestId),
    });

    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repositoryId),
    });

    if (!pr || !repo) {
        await db.update(schema.mergeQueue)
            .set({ status: "failed", failureReason: "PR or repo not found" })
            .where(eq(schema.mergeQueue.id, nextItem.id));
        return { processed: false, entry: nextItem, reason: "PR or repo not found" };
    }

    // Mark as merging
    await db.update(schema.mergeQueue)
        .set({
            status: "merging",
            startedAt: new Date().toISOString()
        })
        .where(eq(schema.mergeQueue.id, nextItem.id));

    try {
        // Import git merge function
        const { mergeBranch, deleteBranch } = await import("./git");

        // Perform the actual merge
        const mergeResult = await mergeBranch(
            repo.diskPath,
            pr.baseBranch,
            pr.headBranch,
            `Merge pull request #${pr.number} from ${pr.headBranch}\n\n${pr.title}`
        );

        if (!mergeResult.success) {
            // Merge failed
            await db.update(schema.mergeQueue)
                .set({
                    status: "failed",
                    failureReason: mergeResult.message,
                    completedAt: new Date().toISOString()
                })
                .where(eq(schema.mergeQueue.id, nextItem.id));

            return { processed: false, entry: nextItem, reason: mergeResult.message };
        }

        // Update PR status
        await db.update(schema.pullRequests)
            .set({
                state: "merged",
                isMerged: true, // Keep this as it's a separate flag
                mergedAt: new Date().toISOString(),
                mergedById: pr.authorId, // In non-queue, this is the merger. In queue, let's blame author or bot?
                mergeCommitSha: mergeResult.sha, // Assuming mergeResult.sha contains the merge commit SHA
                updatedAt: new Date().toISOString()
            })
            .where(eq(schema.pullRequests.id, pr.id));

        // Delete the head branch if requested
        if (nextItem.deleteOnMerge) {
            try {
                await deleteBranch(repo.diskPath, pr.headBranch);
            } catch (e) {
                // Branch deletion is optional, don't fail the merge
            }
        }

        await recordPrMetrics(pr.id);

        // Trigger Webhooks
        try {
            const { triggerWebhooks } = await import("./webhooks");
            await triggerWebhooks(repositoryId, "pull_request", {
                action: "closed",
                pull_request: {
                    id: pr.id,
                    number: pr.number,
                    state: "merged",
                    merged: true,
                    title: pr.title,
                    user: { login: "user" }, // TODO join user
                    head: { ref: pr.headBranch, sha: mergeResult.sha }, // Approximate
                    base: { ref: pr.baseBranch },
                },
                repository: { id: repositoryId }
            });
        } catch (e) {
            console.error("Failed to trigger webhook", e);
        }

        // Mark queue item as completed
        await db.update(schema.mergeQueue)
            .set({
                status: "merged",
                completedAt: new Date().toISOString()
            })
            .where(eq(schema.mergeQueue.id, nextItem.id));

        // Update queue positions
        await updateQueuePositions(repositoryId);

        return { processed: true, entry: nextItem };

    } catch (error: any) {
        // Handle unexpected errors
        await db.update(schema.mergeQueue)
            .set({
                status: "failed",
                failureReason: error.message || "Unexpected error",
                completedAt: new Date().toISOString()
            })
            .where(eq(schema.mergeQueue.id, nextItem.id));

        return { processed: false, entry: nextItem, reason: error.message };
    }
}

/**
 * Update queue positions after a merge
 */
export async function updateQueuePositions(repositoryId: string): Promise<void> {
    const db = getDatabase();

    const items = await db.query.mergeQueue.findMany({
        where: and(
            eq(schema.mergeQueue.repositoryId, repositoryId),
            eq(schema.mergeQueue.status, "pending")
        ),
        orderBy: [desc(schema.mergeQueue.priority), asc(schema.mergeQueue.position)],
    });

    for (let i = 0; i < items.length; i++) {
        await db.update(schema.mergeQueue)
            .set({ position: i + 1 })
            .where(eq(schema.mergeQueue.id, items[i].id));
    }
}

/**
 * Get estimated merge time based on queue position and average CI time
 */
export function estimateMergeTime(
    position: number,
    avgCiTimeMinutes: number = 10
): Date {
    const now = new Date();
    const estimatedMinutes = position * avgCiTimeMinutes;
    return new Date(now.getTime() + estimatedMinutes * 60 * 1000);
}

/**
 * Reprioritize a queue item
 */
export async function updateQueuePriority(
    entryId: string,
    newPriority: number
): Promise<void> {
    const db = getDatabase();

    await db.update(schema.mergeQueue)
        .set({ priority: newPriority })
        .where(eq(schema.mergeQueue.id, entryId));
}
