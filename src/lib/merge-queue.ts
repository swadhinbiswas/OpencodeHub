/**
 * Merge Queue Library
 * Stack-aware merge queue with CI optimization
 * Uses distributed locking for multi-instance safety
 */

import { eq, and, asc, desc, lt, gt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { generateId } from "./utils";
import { getStack, getStackForPr } from "./stacks";
import { recordPrMetrics } from "./developer-metrics";
import { emitQueueEvent } from "./realtime";
import { withLock, isDistributedLocking } from "./distributed-lock";
import { logger } from "./logger";

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
 * Uses distributed lock to prevent race conditions
 */
export async function addToMergeQueue(options: AddToQueueOptions): Promise<typeof schema.mergeQueue.$inferSelect> {
    const lockKey = `merge-queue:add:${options.repositoryId}`;

    return withLock(lockKey, async () => {
        const db = getDatabase() as NodePgDatabase<typeof schema>;

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
            addedAt: new Date(),
            mergeMethod: options.mergeMethod || "merge",
            deleteOnMerge: true,
        };

        await db.insert(schema.mergeQueue).values(entry);

        logger.info({
            repositoryId: options.repositoryId,
            prId: options.pullRequestId,
            position: entry.position,
            distributed: isDistributedLocking
        }, "PR added to merge queue");

        return entry as typeof schema.mergeQueue.$inferSelect;
    }, { ttlSeconds: 10, retryCount: 5 });
}

/**
 * Remove a PR from the merge queue
 */
export async function removeFromMergeQueue(pullRequestId: string): Promise<void> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    await db.delete(schema.mergeQueue)
        .where(eq(schema.mergeQueue.pullRequestId, pullRequestId));
}

/**
 * Get the merge queue for a repository
 */
export async function getMergeQueue(repositoryId: string): Promise<MergeQueueItem[]> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

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
 * Create a speculative branch for parallel CI execution
 */
async function createSpeculativeBranch(
    repoDiskPath: string,
    baseBranch: string,
    prs: { headBranch: string; number: number }[]
): Promise<{ branchName: string; success: boolean; message?: string }> {
    const { createBranch, mergeBranch, deleteBranch } = await import("./git");
    const simpleGit = (await import("simple-git")).simpleGit(repoDiskPath);

    // Generate unique temp branch name
    const timestamp = Date.now();
    const prNumbers = prs.map(p => p.number).join("-");
    const branchName = `mq-spec-${timestamp}-${prNumbers}`;

    try {
        // 1. Create temp branch from base
        await simpleGit.checkout(baseBranch);
        await simpleGit.pull();
        await simpleGit.checkoutLocalBranch(branchName);

        // 2. Merge each PR in order
        for (const pr of prs) {
            try {
                // Must fetch the PR branch first
                await simpleGit.fetch("origin", pr.headBranch);
                await simpleGit.merge([`origin/${pr.headBranch}`]);
            } catch (e) {
                // Conflict detected
                await simpleGit.checkout(baseBranch);
                await deleteBranch(repoDiskPath, branchName);
                return {
                    branchName,
                    success: false,
                    message: `Conflict merging PR #${pr.number} during speculative build`
                };
            }
        }

        // 3. Push to trigger CI
        await simpleGit.push("origin", branchName, ["--force"]);

        return { branchName, success: true };
    } catch (error: any) {
        return { branchName, success: false, message: error.message };
    }
}

/**
 * Process a batch of queue items speculatively
 */
export async function processQueueBatch(repositoryId: string, batchSize: number = 3): Promise<void> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const queueItems = await db.query.mergeQueue.findMany({
        where: and(
            eq(schema.mergeQueue.repositoryId, repositoryId),
            eq(schema.mergeQueue.status, "pending")
        ),
        orderBy: [desc(schema.mergeQueue.priority), asc(schema.mergeQueue.position)],
        limit: batchSize,
    });

    if (queueItems.length === 0) return;

    // Get full PR details for the batch
    const prs: any[] = [];
    for (const item of queueItems) {
        const pr = await db.query.pullRequests.findFirst({
            where: eq(schema.pullRequests.id, item.pullRequestId),
        });
        if (pr) prs.push(pr);
    }

    if (prs.length === 0) return;

    const baseBranch = prs[0].baseBranch;
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repositoryId),
    });

    if (!repo) return;

    // Create speculative combinations
    // 1. Base + PR1
    // 2. Base + PR1 + PR2
    // ...

    const accummulatedPrs: typeof prs = [];

    for (const pr of prs) {
        accummulatedPrs.push(pr);

        // Skip if we just have 1 PR (handled by normal flow, or maybe we unify flow?)
        if (accummulatedPrs.length === 1) continue;

        logger.info({ prNumbers: accummulatedPrs.map(p => p.number) }, "Creating speculative branch");

        const result = await createSpeculativeBranch(
            repo.diskPath,
            baseBranch,
            accummulatedPrs.map(p => ({ headBranch: p.headBranch, number: p.number }))
        );

        // Track the speculative run in the database
        const runId = crypto.randomUUID();
        const prIds = accummulatedPrs.map(p => p.id).join(",");

        await db.insert(schema.mergeQueueSpeculativeRuns).values({
            id: runId,
            repositoryId: repositoryId,
            pullRequestIds: prIds,
            branchName: result.branchName,
            baseBranch: baseBranch,
            status: result.success ? "pending" : "failed",
            createdAt: new Date(),
            failureReason: result.success ? null : result.message,
        });

        if (result.success) {
            logger.info({ runId, branchName: result.branchName }, "Started speculative build");
        } else {
            logger.warn({ runId, message: result.message }, "Speculative build creation failed");
            // Stop chain if conflict found
            break;
        }
    }
}

/**
 * Check if a PR can be merged (all parent PRs in stack must be merged first)
 */
export async function canMerge(pullRequestId: string): Promise<{ canMerge: boolean; reason?: string }> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

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

    const reviewRequirements = await db.query.reviewRequirements.findFirst({
        where: eq(schema.reviewRequirements.repositoryId, pr.repositoryId),
    });

    const requiredApprovals = Math.max(
        reviewRequirements?.minApprovals ?? 0,
        matchingRule ? (matchingRule.requiredApprovals ?? 1) : 0
    );

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
    const blockingReviews = await db.query.pullRequestReviews.findMany({
        where: and(
            eq(schema.pullRequestReviews.pullRequestId, pr.id),
            eq(schema.pullRequestReviews.state, "changes_requested")
        ),
    });

    if (blockingReviews.length > 0) {
        return { canMerge: false, reason: "Changes requested by reviewer" };
    }

    // --- CODE OWNERS ENFORCEMENT ---
    if (reviewRequirements?.requireCodeOwner) {
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, pr.repositoryId)
    });

    if (repo && repo.diskPath) {
        try {
            // 1. Get changed files
            const { getChangedFiles } = await import("./git");
            const changedFiles = await getChangedFiles(repo.diskPath, pr.baseBranch, pr.headBranch);

            if (changedFiles.length > 0) {
                const fileApprovals = await db.query.fileApprovals.findMany({
                    where: eq(schema.fileApprovals.pullRequestId, pr.id),
                });

                if (fileApprovals.length > 0) {
                    const approvalMap = new Map<string, boolean>();

                    for (const approval of fileApprovals) {
                        if (approval.commitSha === pr.headSha) {
                            approvalMap.set(approval.path, true);
                        }
                    }

                    for (const file of changedFiles) {
                        if (!approvalMap.get(file)) {
                            return {
                                canMerge: false,
                                reason: `File approval required for ${file}`
                            };
                        }
                    }
                }

                // 2. Read CODEOWNERS
                const { parseCodeOwners, findOwnersForFiles, getSuggestedReviewers, expandOwnersToUsernames } = await import("./codeowners");
                // Try reading from typical locations
                const fs = await import("fs/promises");
                const path = await import("path");

                let codeOwnersContent = null;
                const possiblePaths = ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"];

                for (const p of possiblePaths) {
                    try {
                        codeOwnersContent = await fs.readFile(path.join(repo.diskPath, p), "utf-8");
                        break;
                    } catch (e) {
                        // Ignore missing file
                    }
                }

                if (codeOwnersContent) {
                    const codeOwners = parseCodeOwners(codeOwnersContent);
                    const requiredOwners = findOwnersForFiles(codeOwners, changedFiles);

                    // If file has owners, we must ensure at least one of them approved?
                    // Or do we need approval from ALL affected files' owners?
                    // GitHub behavior: for each matching pattern, at least one owner must approve.
                    // Here `findOwnersForFiles` returns unique owners of ANY matching file.
                    // Strict implementation: 
                    // For each file, find its owners. If it has owners, at least one of THEM must have approved.

                    // Let's iterate files to be strict.
                    for (const file of changedFiles) {
                        const owners = await import("./codeowners").then(m => m.findOwnersForFile(codeOwners, file));
                        if (owners.length === 0) continue;

                        // Check if ANY of these owners approved
                        // We need the approver IDs. `approvals` contains the review objects.
                        // But reviews link to userIds. We need to map owners (usernames/teams) to userIds.

                        // This is complex because owners are usernames.
                        // We need to resolve usernames to IDs.

                        // Optimization: Get all approver usernames first.
                        const approverUserIds = approvals.map(r => r.reviewerId);
                        const approverUsers = await db.query.users.findMany({
                            where: (users, { inArray }) => inArray(users.id, approverUserIds)
                        });
                        const approverUsernames = new Set(approverUsers.map(u => u.username));

                        const expandedOwners = await expandOwnersToUsernames({
                            db,
                            repository: repo,
                            owners,
                        });

                        const hasOwnerApproval = Array.from(expandedOwners).some((owner) =>
                            approverUsernames.has(owner)
                        );

                        if (!hasOwnerApproval) {
                            return {
                                canMerge: false,
                                reason: `Missing Code Owner approval for ${file} (requires: ${owners.join(", ")})`
                            };
                        }
                    }
                }
            }
        } catch (e) {
            logger.error({ error: e, prId: pr.id }, "Failed to check Code Owners");
            // Don't block on system error, or do? Safer to log and proceed if it's just a check failure?
            // "Fail open" or "Fail closed"? 
            // Better to fail open (allow merge) if just git error, but warn.
        }
    }
    }

    if (reviewRequirements?.requireReReviewOnPush) {
        const { checkStaleReviews } = await import("./multi-reviewer");
        const staleInfo = await checkStaleReviews(pr.id);
        if (staleInfo.stale) {
            return { canMerge: false, reason: "Stale reviews require re-review" };
        }
    }

    if (reviewRequirements?.dismissStaleReviews) {
        const { dismissStaleReviews } = await import("./multi-reviewer");
        await dismissStaleReviews(pr.id, pr.authorId);
    }

    return { canMerge: true };
}

/**
 * Process the next item in the merge queue
 * Uses distributed lock to prevent concurrent processing
 */
export async function processNextInQueue(repositoryId: string): Promise<{
    processed: boolean;
    entry?: typeof schema.mergeQueue.$inferSelect;
    reason?: string;
}> {
    const lockKey = `merge-queue:process:${repositoryId}`;

    return withLock(lockKey, async () => {
        const db = getDatabase() as NodePgDatabase<typeof schema>;

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
            with: { owner: true }
        });

        if (!pr || !repo) {
            await db.update(schema.mergeQueue)
                .set({ status: "failed", failureReason: "PR or repo not found" })
                .where(eq(schema.mergeQueue.id, nextItem.id));
            return { processed: false, entry: nextItem, reason: "PR or repo not found" };
        }

        const prAuthor = await db.query.users.findFirst({
            where: eq(schema.users.id, pr.authorId)
        });

        // Mark as merging
        await db.update(schema.mergeQueue)
            .set({
                status: "merging",
                startedAt: new Date()
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
                        completedAt: new Date()
                    })
                    .where(eq(schema.mergeQueue.id, nextItem.id));

                return { processed: false, entry: nextItem, reason: mergeResult.message };
            }

            // Update PR status
            await db.update(schema.pullRequests)
                .set({
                    state: "merged",
                    isMerged: true, // Keep this as it's a separate flag
                    mergedAt: new Date(),
                    mergedById: pr.authorId, // In non-queue, this is the merger. In queue, let's blame author or bot?
                    mergeCommitSha: mergeResult.sha, // Assuming mergeResult.sha contains the merge commit SHA
                    updatedAt: new Date()
                })
                .where(eq(schema.pullRequests.id, pr.id));

            try {
                const stackInfo = await getStackForPr(pr.id);
                if (stackInfo) {
                    const remaining = stackInfo.entries.filter(
                        (entry) => entry.pr.state === "open" && entry.entry.stackOrder > (stackInfo.entries.find(e => e.pr.id === pr.id)?.entry.stackOrder || 0)
                    );

                    if (remaining.length > 0) {
                        const { autoUpdateStack } = await import("./stack-rebase");
                        await autoUpdateStack(stackInfo.stack.id);
                    }
                }
            } catch (e) {
                logger.warn({ error: e, prId: pr.id }, "Failed to auto-update stack after merge");
            }

            try {
                const { closeLinkedIssuesOnMerge } = await import("./pr-issue-linking");
                await closeLinkedIssuesOnMerge(pr.id, pr.authorId);
            } catch (e) {
                logger.error({ error: e, prId: pr.id }, "Failed to close linked issues on merge");
            }

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
                        user: { login: prAuthor?.username || "unknown" },
                        head: { ref: pr.headBranch, sha: mergeResult.sha }, // Approximate
                        base: { ref: pr.baseBranch },
                    },
                    repository: {
                        id: repositoryId,
                        name: repo.name,
                        owner: { login: repo.owner.username }
                    }
                });
            } catch (e) {
                console.error("Failed to trigger webhook", e);
            }

            // Mark queue item as completed
            await db.update(schema.mergeQueue)
                .set({
                    status: "merged",
                    completedAt: new Date()
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
                    completedAt: new Date()
                })
                .where(eq(schema.mergeQueue.id, nextItem.id));

            return { processed: false, entry: nextItem, reason: error.message };
        }
    }, { ttlSeconds: 120, retryCount: 3 }); // Longer TTL for merge operations
}

/**
 * Update queue positions after a merge
 */
export async function updateQueuePositions(repositoryId: string): Promise<void> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

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
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    await db.update(schema.mergeQueue)
        .set({ priority: newPriority })
        .where(eq(schema.mergeQueue.id, entryId));
}
