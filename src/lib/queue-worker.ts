import { getDatabase, schema } from "@/db";
import { eq, and, asc } from "drizzle-orm";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { mergeBranch, createSpeculativeBranch } from "@/lib/git";
import { acquireRepo, releaseRepo } from "@/lib/git-storage";
import { acquireLock, isDistributedLocking } from "@/lib/distributed-lock";

export class QueueWorker {
    private isProcessing = false;

    async processQueue(repositoryId: string) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        const lockKey = `merge-queue-worker:${repositoryId}`;
        const distributedLock = await acquireLock(lockKey, {
            ttlSeconds: 120,
            retryCount: 0,
        });

        if (!distributedLock) {
            logger.debug({ repositoryId, lockKey }, "Queue worker skipped - lock held by another instance");
            this.isProcessing = false;
            return;
        }

        const db = getDatabase() as NodePgDatabase<typeof schema>;

        try {
            // 1. Check if anything is currently running
            const runningItem = await db.query.mergeQueueItems.findFirst({
                where: and(
                    eq(schema.mergeQueueItems.repositoryId, repositoryId),
                    eq(schema.mergeQueueItems.status, "running")
                ),
                with: {
                    repository: {
                        with: { owner: true }
                    },
                    pullRequest: true
                }
            });

            let itemToProcess: typeof runningItem | null = runningItem ?? null;
            if (runningItem) {
                const runtime = Date.now() - (runningItem.startedAt?.getTime() || 0);
                if (runtime > 10 * 60 * 1000) {
                    logger.warn(`Queue item ${runningItem.id} timed out. Marking failed.`);
                    await db.update(schema.mergeQueueItems)
                        .set({ status: "failed", completedAt: new Date() })
                        .where(eq(schema.mergeQueueItems.id, runningItem.id));
                    itemToProcess = null;
                } else {
                    const ciState = await this.getQueueItemCIState(runningItem.pullRequestId, db);
                    if (ciState === "pending") {
                        logger.info(`Queue item ${runningItem.id} waiting for CI checks.`);
                        return;
                    }
                    if (ciState === "failed") {
                        await db.update(schema.mergeQueueItems)
                            .set({ status: "failed", completedAt: new Date() })
                            .where(eq(schema.mergeQueueItems.id, runningItem.id));
                        logger.warn(`Queue item ${runningItem.id} failed due to failed checks.`);
                        itemToProcess = null;
                    }
                }
            }

            // 2. Pick next item
            if (!itemToProcess) {
                const nextItem = await db.query.mergeQueueItems.findFirst({
                    where: and(
                        eq(schema.mergeQueueItems.repositoryId, repositoryId),
                        eq(schema.mergeQueueItems.status, "queued")
                    ),
                    orderBy: [asc(schema.mergeQueueItems.queuedAt)],
                    with: {
                        repository: {
                            with: { owner: true }
                        },
                        pullRequest: true
                    }
                });

                if (!nextItem) {
                    return;
                }

                await db.update(schema.mergeQueueItems)
                    .set({
                        status: "running",
                        startedAt: new Date(),
                        attemptCount: (nextItem.attemptCount || 0) + 1,
                        lastAttemptAt: new Date()
                    })
                    .where(eq(schema.mergeQueueItems.id, nextItem.id));

                itemToProcess = {
                    ...nextItem,
                    status: "running",
                } as typeof nextItem;
            }

            if (!itemToProcess) return;
            const nextItem = itemToProcess;

            logger.info(`Starting merge for PR ${nextItem.pullRequestId} (${nextItem.repository.owner.username}/${nextItem.repository.name})`);

            // 3b. Trigger Speculative Builds for upcoming PRs
            // We do this concurrently while the main PR is entering its build phase
            this.triggerSpeculativeBuilds(repositoryId, nextItem, db).catch(err => {
                logger.error("Failed to trigger speculative builds", err);
            });

            const ciState = await this.getQueueItemCIState(nextItem.pullRequestId, db);
            if (ciState === "pending") {
                logger.info(`Queue item ${nextItem.id} still waiting for CI checks.`);
                return;
            }
            if (ciState === "failed") {
                await db.update(schema.mergeQueueItems)
                    .set({ status: "failed", completedAt: new Date() })
                    .where(eq(schema.mergeQueueItems.id, nextItem.id));
                logger.warn(`Queue item ${nextItem.id} failed due to failed checks.`);
                return;
            }

            // 4. Execution
            // A. Acquire Repo (Local or Cloud)
            const repoPath = await acquireRepo(nextItem.repository.owner.username, nextItem.repository.name);

            // Attempt Merge Locally first to check conflicts
            const result = await mergeBranch(repoPath, nextItem.pullRequest.baseBranch, nextItem.pullRequest.headBranch);

            if (result.success) {
                // Success!
                // 1. Update PR Status
                const now = new Date();
                await db.update(schema.pullRequests)
                    .set({
                        state: "merged",
                        isMerged: true,
                        mergedAt: now,
                        // mergedById: system user?
                        updatedAt: now,
                    })
                    .where(eq(schema.pullRequests.id, nextItem.pullRequestId));

                // 2. Update Queue Item
                await db.update(schema.mergeQueueItems)
                    .set({ status: "merged", completedAt: now })
                    .where(eq(schema.mergeQueueItems.id, nextItem.id));

                // 3. Sync Logic (Release Repo with modified=true)
                // Since mergeBranch modified the repo (update-ref), we must push back.
                await releaseRepo(nextItem.repository.owner.username, nextItem.repository.name, true);

                logger.info(`PR ${nextItem.pullRequestId} merged successfully via queue.`);
            } else {
                // Failure (Conflict)
                await db.update(schema.mergeQueueItems)
                    .set({ status: "failed", completedAt: new Date() })
                    .where(eq(schema.mergeQueueItems.id, nextItem.id));

                // Release without sync (no changes to base, strict speaking merge-tree doesn't touch base if fail? 
                // Actually mergeBranch implementation might have failed before update-ref or during conflict check.
                await releaseRepo(nextItem.repository.owner.username, nextItem.repository.name, false);

                logger.warn(`PR ${nextItem.pullRequestId} failed to merge: ${result.message}`);
            }

        } catch (error) {
            logger.error("Error processing merge queue", error);
            // Try to release repo if stuck?
            // We don't have scope here easily, but acquireRepo is safe to re-acquire (cleans up).
        } finally {
            await distributedLock.release();
            this.isProcessing = false;
            // Trigger next immediately?
            // this.processQueue(repositoryId);
        }
    }

    private async getQueueItemCIState(
        pullRequestId: string,
        db: NodePgDatabase<typeof schema>
    ): Promise<"pending" | "passed" | "failed"> {
        // 1. External/ingested checks (GitHub-style check runs)
        const checks = await db.query.pullRequestChecks.findMany({
            where: eq(schema.pullRequestChecks.pullRequestId, pullRequestId),
        });

        if (checks.length > 0) {
            const hasPending = checks.some((check) => check.status !== "completed");
            if (hasPending) return "pending";
            const hasFailed = checks.some((check) =>
                ["failure", "cancelled", "timed_out", "action_required"].includes(check.conclusion || "")
            );
            if (hasFailed) return "failed";
            return "passed";
        }

        // 2. Native pipeline runs (WS1-15): gate on the persisted workflow
        //    runs for this PR's head branch (push-triggered or speculative)
        const pr = await db.query.pullRequests.findFirst({
            where: eq(schema.pullRequests.id, pullRequestId),
        });
        if (pr) {
            const runs = await db.query.workflowRuns.findMany({
                where: eq(schema.workflowRuns.headBranch, pr.headBranch),
                orderBy: (runs, { desc }) => [desc(runs.runNumber)],
                limit: 5,
            });
            if (runs.length > 0) {
                if (runs.some((r) => r.status === "queued" || r.status === "in_progress")) {
                    return "pending";
                }
                const latest = runs[0];
                if (latest.status === "completed") {
                    if (latest.conclusion === "failure") return "failed";
                    if (latest.conclusion === "success") return "passed";
                }
            }
        }

        // 3. No checks and no native runs: allow the queue to proceed.
        return "passed";
    }

    /**
     * Look ahead in the queue and trigger speculative builds
     */
    private async triggerSpeculativeBuilds(
        repositoryId: string,
        currentItem: any,
        db: NodePgDatabase<typeof schema>
    ) {
        // Fetch next 2 items
        const lookaheadItems = await db.query.mergeQueueItems.findMany({
            where: and(
                eq(schema.mergeQueueItems.repositoryId, repositoryId),
                eq(schema.mergeQueueItems.status, "queued")
            ),
            orderBy: [asc(schema.mergeQueueItems.queuedAt)],
            limit: 2,
        });

        if (lookaheadItems.length === 0) return;

        logger.info(`Found ${lookaheadItems.length} items for speculative execution`);

        const repo = currentItem.repository;
        const repoPath = await acquireRepo(repo.owner.username, repo.name); // Re-acquire safe? Yes

        try {
            // Build the chain of PRs: [Current, Next 1, Next 2]
            const prChain = [
                { headBranch: currentItem.pullRequest.headBranch, number: currentItem.pullRequest.number }
            ];

            for (const item of lookaheadItems) {
                // If already has an execution branch, skip (assume already handling)
                if (item.executionBranch) continue;

                // Fetch PR details
                const pr = await db.query.pullRequests.findFirst({
                    where: eq(schema.pullRequests.id, item.pullRequestId)
                });

                if (!pr) continue;

                prChain.push({ headBranch: pr.headBranch, number: pr.number });

                logger.info(`Creating speculative branch for PR #${pr.number} (Chain: ${prChain.map(p => p.number).join("+")})`);

                const result = await createSpeculativeBranch(
                    repoPath,
                    pr.baseBranch, // Assuming all target same base
                    [...prChain] // Copy array
                );

                if (result.success) {
                    await db.update(schema.mergeQueueItems)
                        .set({
                            executionBranch: result.branchName,
                            // We don't set status to 'running' to keep them in 'queued' for the main worker loop,
                            // but having executionBranch implies speculative CI is running.
                        })
                        .where(eq(schema.mergeQueueItems.id, item.id));

                    // ── WS1-09: actually RUN the speculative CI ──────────
                    try {
                        const { triggerSpecWorkflow } = await import("@/lib/workflows");
                        const specSha = await (async () => {
                            const { getGit } = await import("@/lib/git");
                            return getGit(repoPath).revparse([result.branchName]).catch(() => "");
                        })();
                        if (specSha) {
                            triggerSpecWorkflow({
                                repositoryId,
                                repositoryPath: repoPath,
                                specBranch: result.branchName,
                                baseBranch: pr.baseBranch,
                                commitSha: specSha.trim(),
                            }).catch((err) => logger.error({ err }, "Speculative CI trigger failed"));
                        }
                    } catch (err) {
                        logger.warn({ err }, "Speculative CI not triggered");
                    }

                    logger.info(`Speculative branch created: ${result.branchName}`);
                } else {
                    logger.warn(`Failed to create speculative branch: ${result.message}`);
                }
            }
        } finally {
            // We don't release here because the main loop holds the lock? 
            // acquireRepo is usually re-entrant for same process/path or handles locking. 
            // Checks if git-storage supports concurrent access. 
            // Assuming it does simply resolve path.
        }
    }
}

export const queueWorker = new QueueWorker();

export function getQueueWorkerScalingReadiness() {
    return {
        inProcessGuardEnabled: true,
        distributedLockingEnabled: isDistributedLocking,
        multiInstanceSafe: isDistributedLocking,
    };
}
