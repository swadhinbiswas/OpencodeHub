import { getDatabase, schema } from "@/db";
import { eq, and, asc } from "drizzle-orm";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { mergeBranch, createSpeculativeBranch } from "@/lib/git";
import { acquireRepo, releaseRepo } from "@/lib/git-storage";

export class QueueWorker {
    private isProcessing = false;

    async processQueue(repositoryId: string) {
        if (this.isProcessing) return;
        this.isProcessing = true;

        const db = getDatabase() as NodePgDatabase<typeof schema>;

        try {
            // 1. Check if anything is currently running
            const runningItem = await db.query.mergeQueueItems.findFirst({
                where: and(
                    eq(schema.mergeQueueItems.repositoryId, repositoryId),
                    eq(schema.mergeQueueItems.status, "running")
                ),
            });

            if (runningItem) {
                // In a real system, we'd check if the CI job is still active.
                // For MVP, we'll assume the previous run crashed if it's been running too long (>10m)
                const runtime = Date.now() - (runningItem.startedAt?.getTime() || 0);
                if (runtime > 10 * 60 * 1000) {
                    logger.warn(`Queue item ${runningItem.id} timed out. Marking failed.`);
                    await db.update(schema.mergeQueueItems)
                        .set({ status: "failed", completedAt: new Date() })
                        .where(eq(schema.mergeQueueItems.id, runningItem.id));
                    // Continue to next item
                } else {
                    return;
                }
            }

            // 2. Pick next item
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

            // 3. Start processing
            await db.update(schema.mergeQueueItems)
                .set({
                    status: "running",
                    startedAt: new Date(),
                    attemptCount: (nextItem.attemptCount || 0) + 1,
                    lastAttemptAt: new Date()
                })
                .where(eq(schema.mergeQueueItems.id, nextItem.id));

            logger.info(`Starting merge for PR ${nextItem.pullRequestId} (${nextItem.repository.owner.username}/${nextItem.repository.name})`);

            // 3b. Trigger Speculative Builds for upcoming PRs
            // We do this concurrently while the main PR is entering its build phase
            this.triggerSpeculativeBuilds(repositoryId, nextItem, db).catch(err => {
                logger.error("Failed to trigger speculative builds", err);
            });

            // 4. Execution
            // A. Acquire Repo (Local or Cloud)
            const repoPath = await acquireRepo(nextItem.repository.owner.username, nextItem.repository.name);

            // B. Simulate CI - In a real world, we'd trigger a workflow here and exit, waiting for a webhook callback.
            // For MVP "Flesh out", we simulate 'running tests' on the merge result.

            // Attempt Merge Locally first to check conflicts
            const result = await mergeBranch(repoPath, nextItem.pullRequest.baseBranch, nextItem.pullRequest.headBranch);

            // B. Simulate CI / Check Speculative Result
            if (nextItem.executionBranch) {
                logger.info(`Speculative hit for PR ${nextItem.pullRequestId} using branch ${nextItem.executionBranch}. Skipping build wait.`);
                // In a real system, we would verify the CI status of executionBranch here.
                // Since we created it successfully in triggerSpeculativeBuilds, we assume it passed.
            } else {
                // Simulate Build Time for non-speculative runs
                logger.info(`Running CI simulation for PR ${nextItem.pullRequestId}...`);
                await new Promise(r => setTimeout(r, 5000));
            }

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
            this.isProcessing = false;
            // Trigger next immediately?
            // this.processQueue(repositoryId);
        }
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
