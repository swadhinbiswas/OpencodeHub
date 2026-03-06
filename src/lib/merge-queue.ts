/**
 * Merge Queue Library
 * Stack-aware merge queue with CI optimization
 * Uses distributed locking for multi-instance safety
 */

import { getDatabase, schema } from "@/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { recordPrMetrics } from "./developer-metrics";
import { isDistributedLocking, withLock } from "./distributed-lock";
import { resolveRepoPath } from "./git-storage";
import { logger } from "./logger";
import { getStackForPr } from "./stacks";
import { generateId } from "./utils";

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
export async function addToMergeQueue(
  options: AddToQueueOptions,
): Promise<typeof schema.mergeQueue.$inferSelect> {
  const lockKey = `merge-queue:add:${options.repositoryId}`;

  return withLock(
    lockKey,
    async () => {
      const db = getDatabase() as NodePgDatabase<typeof schema>;

      // Check if already in queue
      const existing = await db.query.mergeQueue.findFirst({
        where: and(
          eq(schema.mergeQueue.pullRequestId, options.pullRequestId),
          eq(schema.mergeQueue.status, "pending"),
        ),
      });

      if (existing) {
        throw new Error("PR is already in the merge queue");
      }

      // Get current max position
      const queueItems = await db.query.mergeQueue.findMany({
        where: and(
          eq(schema.mergeQueue.repositoryId, options.repositoryId),
          eq(schema.mergeQueue.status, "pending"),
        ),
        orderBy: [desc(schema.mergeQueue.position)],
        limit: 1,
      });

      const maxPosition =
        queueItems.length > 0 ? queueItems[0].position || 0 : 0;

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

      logger.info(
        {
          repositoryId: options.repositoryId,
          prId: options.pullRequestId,
          position: entry.position,
          distributed: isDistributedLocking,
        },
        "PR added to merge queue",
      );

      return entry as typeof schema.mergeQueue.$inferSelect;
    },
    { ttlSeconds: 10, retryCount: 5 },
  );
}

/**
 * Remove a PR from the merge queue
 */
export async function removeFromMergeQueue(
  pullRequestId: string,
): Promise<void> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  await db
    .delete(schema.mergeQueue)
    .where(eq(schema.mergeQueue.pullRequestId, pullRequestId));
}

/**
 * Get the merge queue for a repository
 */
export async function getMergeQueue(
  repositoryId: string,
): Promise<MergeQueueItem[]> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const queueEntries = await db.query.mergeQueue.findMany({
    where: and(
      eq(schema.mergeQueue.repositoryId, repositoryId),
      eq(schema.mergeQueue.status, "pending"),
    ),
    orderBy: [
      desc(schema.mergeQueue.priority),
      asc(schema.mergeQueue.position),
    ],
  });

  if (queueEntries.length === 0) return [];

  // Batch fetch all PRs in one query instead of N individual lookups
  const prIds = queueEntries.map((e) => e.pullRequestId);
  const prs = await db.query.pullRequests.findMany({
    where: inArray(schema.pullRequests.id, prIds),
  });
  const prMap = new Map(prs.map((pr) => [pr.id, pr]));

  // Batch fetch all stacks for entries that reference one
  const stackIds = [
    ...new Set(queueEntries.map((e) => e.stackId).filter(Boolean)),
  ] as string[];

  const stackDataMap = new Map<
    string,
    {
      id: string;
      name: string | null;
      entries: Array<{ prNumber: number; prState: string; isMerged: boolean }>;
    }
  >();

  if (stackIds.length > 0) {
    const allStacks = await db.query.prStacks.findMany({
      where: inArray(schema.prStacks.id, stackIds),
    });
    const allStackEntries = await db.query.prStackEntries.findMany({
      where: inArray(schema.prStackEntries.stackId, stackIds),
      orderBy: [asc(schema.prStackEntries.stackOrder)],
    });

    // Fetch any PRs referenced by stack entries that we don't already have
    const stackEntryPrIds = [
      ...new Set(allStackEntries.map((e) => e.pullRequestId)),
    ];
    const missingPrIds = stackEntryPrIds.filter((id) => !prMap.has(id));
    if (missingPrIds.length > 0) {
      const additionalPrs = await db.query.pullRequests.findMany({
        where: inArray(schema.pullRequests.id, missingPrIds),
      });
      for (const pr of additionalPrs) {
        prMap.set(pr.id, pr);
      }
    }

    for (const stack of allStacks) {
      const entries = allStackEntries
        .filter((e) => e.stackId === stack.id)
        .map((entry) => {
          const pr = prMap.get(entry.pullRequestId);
          return pr
            ? {
                prNumber: pr.number,
                prState: pr.state,
                isMerged: pr.isMerged || false,
              }
            : null;
        })
        .filter(Boolean) as Array<{
        prNumber: number;
        prState: string;
        isMerged: boolean;
      }>;

      stackDataMap.set(stack.id, {
        id: stack.id,
        name: stack.name,
        entries,
      });
    }
  }

  return queueEntries
    .filter((entry) => prMap.has(entry.pullRequestId))
    .map((entry) => {
      const pr = prMap.get(entry.pullRequestId)!;
      const stack = entry.stackId ? stackDataMap.get(entry.stackId) : undefined;
      return { entry, pr, stack };
    });
}

/**
 * Create a speculative branch for parallel CI execution.
 * Clones the bare repo to a temp directory to perform merge operations,
 * since bare repos don't support checkout/merge directly.
 */
async function createSpeculativeBranch(
  repoDiskPath: string,
  baseBranch: string,
  prs: { headBranch: string; number: number }[],
): Promise<{ branchName: string; success: boolean; message?: string }> {
  const { deleteBranch } = await import("./git");
  const localRepoPath = await resolveRepoPath(repoDiskPath);
  const { simpleGit: createSimpleGit } = await import("simple-git");
  const { mkdtemp, rm } = await import("fs/promises");
  const { join } = await import("path");
  const os = await import("os");

  // Generate unique temp branch name
  const timestamp = Date.now();
  const prNumbers = prs.map((p) => p.number).join("-");
  const branchName = `mq-spec-${timestamp}-${prNumbers}`;

  // Create a temp working directory — bare repos don't support checkout/merge
  const tmpDir = await mkdtemp(join(os.tmpdir(), "mq-spec-"));

  try {
    // 1. Clone bare repo to temp (non-bare) working copy
    const git = createSimpleGit();
    await git.clone(localRepoPath, tmpDir, ["--no-checkout", "--shared"]);

    const workGit = createSimpleGit(tmpDir);

    // 2. Checkout base branch into the working copy
    await workGit.checkout(baseBranch);

    // 3. Create speculative branch
    await workGit.checkoutLocalBranch(branchName);

    // 4. Merge each PR branch in order
    for (const pr of prs) {
      try {
        await workGit.fetch("origin", pr.headBranch);
        await workGit.merge([`origin/${pr.headBranch}`]);
      } catch (e) {
        // Conflict detected — abort and clean up
        logger.warn(
          { prNumber: pr.number, branchName },
          "Speculative merge conflict",
        );
        return {
          branchName,
          success: false,
          message: `Conflict merging PR #${pr.number} during speculative build`,
        };
      }
    }

    // 5. Push the speculative branch back to the bare repo
    await workGit.push("origin", branchName, ["--force"]);

    return { branchName, success: true };
  } catch (error: any) {
    return { branchName, success: false, message: error.message };
  } finally {
    // Always clean up the temp directory
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      logger.warn({ tmpDir }, "Failed to clean up speculative merge temp dir");
    }
  }
}

/**
 * Process a batch of queue items speculatively
 */
export async function processQueueBatch(
  repositoryId: string,
  batchSize: number = 3,
): Promise<void> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const queueItems = await db.query.mergeQueue.findMany({
    where: and(
      eq(schema.mergeQueue.repositoryId, repositoryId),
      eq(schema.mergeQueue.status, "pending"),
    ),
    orderBy: [
      desc(schema.mergeQueue.priority),
      asc(schema.mergeQueue.position),
    ],
    limit: batchSize,
  });

  if (queueItems.length === 0) return;

  // Batch fetch all PR details in one query instead of N individual lookups
  const prIds = queueItems.map((item) => item.pullRequestId);
  const prs = await db.query.pullRequests.findMany({
    where: inArray(schema.pullRequests.id, prIds),
  });

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

    logger.info(
      { prNumbers: accummulatedPrs.map((p) => p.number) },
      "Creating speculative branch",
    );

    const result = await createSpeculativeBranch(
      repo.diskPath,
      baseBranch,
      accummulatedPrs.map((p) => ({
        headBranch: p.headBranch,
        number: p.number,
      })),
    );

    // Track the speculative run in the database
    const runId = crypto.randomUUID();
    const prIds = accummulatedPrs.map((p) => p.id).join(",");

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
      logger.info(
        { runId, branchName: result.branchName },
        "Started speculative build",
      );
    } else {
      logger.warn(
        { runId, message: result.message },
        "Speculative build creation failed",
      );
      // Stop chain if conflict found
      break;
    }
  }
}

/**
 * Check if a PR can be merged (all parent PRs in stack must be merged first)
 */
export async function canMerge(
  pullRequestId: string,
): Promise<{ canMerge: boolean; reason?: string }> {
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
    const prEntry = stackInfo.entries.find((e) => e.pr.id === pullRequestId);
    if (prEntry && prEntry.entry.parentPrId) {
      // Check if parent is merged
      const parentPr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prEntry.entry.parentPrId),
      });

      if (parentPr && !parentPr.isMerged) {
        return {
          canMerge: false,
          reason: `Parent PR #${parentPr.number} must be merged first`,
        };
      }
    }
  }

  const runsForHead = await db.query.workflowRuns.findMany({
    where: and(
      eq(schema.workflowRuns.pullRequestId, pr.id),
      eq(schema.workflowRuns.headSha, pr.headSha),
    ),
    orderBy: [desc(schema.workflowRuns.createdAt)],
  });

  // Check Branch Protection Rules
  const rules = await db.query.branchProtection.findMany({
    where: and(
      eq(schema.branchProtection.repositoryId, pr.repositoryId),
      eq(schema.branchProtection.active, true),
    ),
  });

  const matchingRule = rules.find((rule) => {
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
    matchingRule ? (matchingRule.requiredApprovals ?? 1) : 0,
  );

  // Evaluate by each reviewer's latest review state.
  const allReviews = await db.query.pullRequestReviews.findMany({
    where: eq(schema.pullRequestReviews.pullRequestId, pr.id),
    orderBy: [desc(schema.pullRequestReviews.submittedAt)],
  });
  const latestReviewsByUser = new Map<string, (typeof allReviews)[number]>();
  for (const review of allReviews) {
    if (!latestReviewsByUser.has(review.reviewerId)) {
      latestReviewsByUser.set(review.reviewerId, review);
    }
  }
  const latestApprovedReviews = Array.from(latestReviewsByUser.values()).filter(
    (review) => review.state === "approved",
  );
  const latestBlockingReviews = Array.from(latestReviewsByUser.values()).filter(
    (review) => review.state === "changes_requested",
  );

  if (latestApprovedReviews.length < requiredApprovals) {
    return {
      canMerge: false,
      reason: `At least ${requiredApprovals} approval(s) required (has ${latestApprovedReviews.length})`,
    };
  }

  if (latestBlockingReviews.length > 0) {
    return { canMerge: false, reason: "Changes requested by reviewer" };
  }

  // Enforce explicitly required reviewers (multi-reviewer rule depth).
  const requiredReviewers = await db.query.pullRequestReviewers.findMany({
    where: and(
      eq(schema.pullRequestReviewers.pullRequestId, pr.id),
      eq(schema.pullRequestReviewers.isRequired, true),
    ),
  });
  if (requiredReviewers.length > 0) {
    const missingRequiredApprovals: string[] = [];
    for (const reviewer of requiredReviewers) {
      const latestReview = latestReviewsByUser.get(reviewer.userId);
      if (!latestReview || latestReview.state !== "approved") {
        missingRequiredApprovals.push(reviewer.userId);
      }
    }

    if (missingRequiredApprovals.length > 0) {
      return {
        canMerge: false,
        reason: `Required reviewer approvals missing (${missingRequiredApprovals.length})`,
      };
    }
  }

  const statusChecks = await db.query.requiredStatusChecks.findMany({
    where: and(
      eq(schema.requiredStatusChecks.repositoryId, pr.repositoryId),
      eq(schema.requiredStatusChecks.isRequired, true),
    ),
  });
  const requiredChecksForBranch = statusChecks.filter((check) => {
    if (check.branch === pr.baseBranch) return true;
    if (check.branch.endsWith("*")) {
      return pr.baseBranch.startsWith(check.branch.slice(0, -1));
    }
    return false;
  });

  if (requiredChecksForBranch.length > 0) {
    if (runsForHead.length === 0) {
      return {
        canMerge: false,
        reason: "Required status checks not found for latest commit",
      };
    }

    const successfulRunNames = new Set(
      runsForHead
        .filter((run) => {
          if (run.status === "success") return true;
          if (run.status === "completed" && run.conclusion === "success")
            return true;
          return false;
        })
        .map((run) => run.name),
    );

    for (const requiredCheck of requiredChecksForBranch) {
      if (!successfulRunNames.has(requiredCheck.checkName)) {
        return {
          canMerge: false,
          reason: `Required status check "${requiredCheck.checkName}" has not succeeded`,
        };
      }
    }
  } else {
    // Fallback: if there is a latest run for this head, it must not be failing.
    const latestRun = runsForHead[0];
    if (latestRun) {
      const running =
        latestRun.status === "running" ||
        latestRun.status === "queued" ||
        latestRun.status === "in_progress";
      const failed =
        latestRun.status === "failed" ||
        (latestRun.status === "completed" &&
          latestRun.conclusion === "failure");
      if (running) return { canMerge: false, reason: "CI is still running" };
      if (failed) return { canMerge: false, reason: "CI checks failed" };
    }
  }

  const externalConfigs = await db.query.externalCIConfigs.findMany({
    where: and(
      eq(schema.externalCIConfigs.repositoryId, pr.repositoryId),
      eq(schema.externalCIConfigs.isEnabled, true),
      eq(schema.externalCIConfigs.syncStatus, true),
    ),
  });

  if (externalConfigs.length > 0) {
    const configIds = externalConfigs.map((config) => config.id);
    const externalBuilds = await db.query.externalBuilds.findMany({
      where: and(
        eq(schema.externalBuilds.pullRequestId, pr.id),
        inArray(schema.externalBuilds.configId, configIds),
      ),
      orderBy: [desc(schema.externalBuilds.createdAt)],
    });

    for (const config of externalConfigs) {
      const latestBuild = externalBuilds.find(
        (build) => build.configId === config.id,
      );
      if (!latestBuild) {
        return {
          canMerge: false,
          reason: `External CI "${config.name}" has not reported status for this pull request`,
        };
      }
      const status = (latestBuild.status || "").toLowerCase();
      if (
        status === "pending" ||
        status === "running" ||
        status === "queued" ||
        status === "in_progress"
      ) {
        return {
          canMerge: false,
          reason: `External CI "${config.name}" is still running`,
        };
      }
      if (status !== "success" && status !== "passed") {
        return {
          canMerge: false,
          reason: `External CI "${config.name}" did not pass`,
        };
      }
    }
  }

  if (
    (reviewRequirements?.requireCodeOwner ?? false) ||
    (matchingRule?.requireCodeOwnerReviews ?? false)
  ) {
    const { checkCodeOwnerApprovalsForPR } = await import("./pr-codeowner");
    const codeOwnerCheck = await checkCodeOwnerApprovalsForPR(db, pr.id);
    if (!codeOwnerCheck.ok) {
      return {
        canMerge: false,
        reason: codeOwnerCheck.reason || "Code owner approval required",
      };
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

  return withLock(
    lockKey,
    async () => {
      const db = getDatabase() as NodePgDatabase<typeof schema>;

      // Get next item to process
      const nextItem = await db.query.mergeQueue.findFirst({
        where: and(
          eq(schema.mergeQueue.repositoryId, repositoryId),
          eq(schema.mergeQueue.status, "pending"),
        ),
        orderBy: [
          desc(schema.mergeQueue.priority),
          asc(schema.mergeQueue.position),
        ],
      });

      if (!nextItem) {
        return { processed: false, reason: "Queue is empty" };
      }

      // Check if it can be merged
      const mergeCheck = await canMerge(nextItem.pullRequestId);

      if (!mergeCheck.canMerge) {
        // Skip this item and try next
        await db
          .update(schema.mergeQueue)
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
        with: { owner: true },
      });

      if (!pr || !repo) {
        await db
          .update(schema.mergeQueue)
          .set({ status: "failed", failureReason: "PR or repo not found" })
          .where(eq(schema.mergeQueue.id, nextItem.id));
        return {
          processed: false,
          entry: nextItem,
          reason: "PR or repo not found",
        };
      }

      const prAuthor = await db.query.users.findFirst({
        where: eq(schema.users.id, pr.authorId),
      });
      const mergedById = nextItem.addedById || pr.authorId;
      const mergedByUser = await db.query.users.findFirst({
        where: eq(schema.users.id, mergedById),
      });

      // Mark as merging
      await db
        .update(schema.mergeQueue)
        .set({
          status: "merging",
          startedAt: new Date(),
        })
        .where(eq(schema.mergeQueue.id, nextItem.id));

      try {
        // Import git merge function
        const { mergeBranch, deleteBranch } = await import("./git");
        const localRepoPath = await resolveRepoPath(repo.diskPath);

        // Perform the actual merge
        const mergeResult = await mergeBranch(
          localRepoPath,
          pr.baseBranch,
          pr.headBranch,
          `Merge pull request #${pr.number} from ${pr.headBranch}\n\n${pr.title}`,
        );

        if (!mergeResult.success) {
          // Merge failed
          await db
            .update(schema.mergeQueue)
            .set({
              status: "failed",
              failureReason: mergeResult.message,
              completedAt: new Date(),
            })
            .where(eq(schema.mergeQueue.id, nextItem.id));

          return {
            processed: false,
            entry: nextItem,
            reason: mergeResult.message,
          };
        }

        // Update PR status
        await db
          .update(schema.pullRequests)
          .set({
            state: "merged",
            isMerged: true, // Keep this as it's a separate flag
            mergedAt: new Date(),
            mergedById,
            mergeCommitSha: mergeResult.sha, // Assuming mergeResult.sha contains the merge commit SHA
            mergeSha: mergeResult.sha,
            mergeMethod: nextItem.mergeMethod || "merge",
            updatedAt: new Date(),
          })
          .where(eq(schema.pullRequests.id, pr.id));

        try {
          const stackInfo = await getStackForPr(pr.id);
          if (stackInfo) {
            const remaining = stackInfo.entries.filter(
              (entry) =>
                entry.pr.state === "open" &&
                entry.entry.stackOrder >
                  (stackInfo.entries.find((e) => e.pr.id === pr.id)?.entry
                    .stackOrder || 0),
            );

            if (remaining.length > 0) {
              const { autoUpdateStack } = await import("./stack-rebase");
              await autoUpdateStack(stackInfo.stack.id);
            }
          }
        } catch (e) {
          logger.warn(
            { error: e, prId: pr.id },
            "Failed to auto-update stack after merge",
          );
        }

        try {
          const { closeLinkedIssuesOnMerge } =
            await import("./pr-issue-linking");
          await closeLinkedIssuesOnMerge(pr.id, mergedById);
        } catch (e) {
          logger.error(
            { error: e, prId: pr.id },
            "Failed to close linked issues on merge",
          );
        }

        // Delete the head branch if requested
        if (nextItem.deleteOnMerge) {
          try {
            await deleteBranch(localRepoPath, pr.headBranch);
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
              user: {
                login:
                  mergedByUser?.username || prAuthor?.username || "unknown",
              },
              head: { ref: pr.headBranch, sha: mergeResult.sha }, // Approximate
              base: { ref: pr.baseBranch },
            },
            repository: {
              id: repositoryId,
              name: repo.name,
              owner: { login: repo.owner.username },
            },
          });
        } catch (e) {
          logger.error("Failed to trigger webhook", e);
        }

        // Mark queue item as completed
        await db
          .update(schema.mergeQueue)
          .set({
            status: "merged",
            completedAt: new Date(),
          })
          .where(eq(schema.mergeQueue.id, nextItem.id));

        // Update queue positions
        await updateQueuePositions(repositoryId);

        return { processed: true, entry: nextItem };
      } catch (error: any) {
        // Handle unexpected errors
        await db
          .update(schema.mergeQueue)
          .set({
            status: "failed",
            failureReason: error.message || "Unexpected error",
            completedAt: new Date(),
          })
          .where(eq(schema.mergeQueue.id, nextItem.id));

        return { processed: false, entry: nextItem, reason: error.message };
      }
    },
    { ttlSeconds: 120, retryCount: 3 },
  ); // Longer TTL for merge operations
}

/**
 * Update queue positions after a merge
 */
export async function updateQueuePositions(
  repositoryId: string,
): Promise<void> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const items = await db.query.mergeQueue.findMany({
    where: and(
      eq(schema.mergeQueue.repositoryId, repositoryId),
      eq(schema.mergeQueue.status, "pending"),
    ),
    orderBy: [
      desc(schema.mergeQueue.priority),
      asc(schema.mergeQueue.position),
    ],
  });

  for (let i = 0; i < items.length; i++) {
    await db
      .update(schema.mergeQueue)
      .set({ position: i + 1 })
      .where(eq(schema.mergeQueue.id, items[i].id));
  }
}

/**
 * Get estimated merge time based on queue position and average CI time
 */
export function estimateMergeTime(
  position: number,
  avgCiTimeMinutes: number = 10,
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
  newPriority: number,
): Promise<void> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  await db
    .update(schema.mergeQueue)
    .set({ priority: newPriority })
    .where(eq(schema.mergeQueue.id, entryId));
}

// ============================================================================
// PRIORITY LANES
// ============================================================================

/** Priority lane constants */
export const PRIORITY_LANES = {
  URGENT: 100, // Hotfixes, critical security patches
  HIGH: 50, // Important features, blocking bugs
  NORMAL: 0, // Default
  LOW: -50, // Non-urgent refactors, documentation
} as const;

/**
 * Add a PR to the urgent lane — jumps ahead of all normal-priority items
 */
export async function addToUrgentLane(
  options: Omit<AddToQueueOptions, "priority">,
): Promise<typeof schema.mergeQueue.$inferSelect> {
  return addToMergeQueue({
    ...options,
    priority: PRIORITY_LANES.URGENT,
  });
}

// ============================================================================
// AUTO-RETRY ON FLAKY CI
// ============================================================================

const MAX_CI_RETRIES = parseInt(
  process.env.MERGE_QUEUE_MAX_CI_RETRIES || "3",
  10,
);

/**
 * Handle CI failure for a merge queue entry.
 * If under the retry limit, re-trigger CI instead of failing the entry.
 */
export async function handleCIFailure(
  entryId: string,
  repositoryId: string,
): Promise<{ retried: boolean; attempt: number }> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const entry = await db.query.mergeQueue.findFirst({
    where: eq(schema.mergeQueue.id, entryId),
  });

  if (!entry) {
    return { retried: false, attempt: 0 };
  }

  const currentAttempt = entry.attemptCount || 0;

  if (currentAttempt < MAX_CI_RETRIES) {
    // Increment attempt count and reset CI status for retry
    await db
      .update(schema.mergeQueue)
      .set({
        ciStatus: "pending",
        attemptCount: currentAttempt + 1,
        lastAttemptAt: new Date(),
        failureReason: null,
      })
      .where(eq(schema.mergeQueue.id, entryId));

    logger.info(
      { entryId, attempt: currentAttempt + 1, maxRetries: MAX_CI_RETRIES },
      "Retrying CI for merge queue entry (flaky CI protection)",
    );

    return { retried: true, attempt: currentAttempt + 1 };
  }

  // Max retries exhausted — mark as failed
  await db
    .update(schema.mergeQueue)
    .set({
      status: "failed",
      ciStatus: "failed",
      failureReason: `CI failed after ${MAX_CI_RETRIES} retries`,
      completedAt: new Date(),
    })
    .where(eq(schema.mergeQueue.id, entryId));

  logger.warn(
    { entryId, attempts: MAX_CI_RETRIES },
    "Merge queue entry failed after max CI retries",
  );

  return { retried: false, attempt: currentAttempt };
}

// ============================================================================
// QUEUE DASHBOARD DATA
// ============================================================================

export interface QueueDashboardItem {
  id: string;
  position: number;
  priority: number;
  priorityLane: string;
  prNumber: number;
  prTitle: string;
  headBranch: string;
  baseBranch: string;
  author: string;
  ciStatus: string;
  attemptCount: number;
  addedAt: Date;
  estimatedMergeAt: Date;
  waitTimeMinutes: number;
}

/**
 * Get full queue dashboard data with ETA for each item
 */
export async function getQueueDashboard(
  repositoryId: string,
  avgCiTimeMinutes: number = 10,
): Promise<QueueDashboardItem[]> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const entries = await db.query.mergeQueue.findMany({
    where: and(
      eq(schema.mergeQueue.repositoryId, repositoryId),
      eq(schema.mergeQueue.status, "pending"),
    ),
    orderBy: [
      desc(schema.mergeQueue.priority),
      asc(schema.mergeQueue.position),
    ],
  });

  if (entries.length === 0) return [];

  // Batch-fetch PRs and users
  const prIds = entries.map((e) => e.pullRequestId);
  const prs = await db.query.pullRequests.findMany({
    where: inArray(schema.pullRequests.id, prIds),
  });
  const prMap = new Map(prs.map((p) => [p.id, p]));

  const authorIds = [...new Set(prs.map((p) => p.authorId))];
  const authors = await db.query.users.findMany({
    where: inArray(schema.users.id, authorIds),
  });
  const authorMap = new Map(authors.map((u) => [u.id, u]));

  const now = Date.now();

  return entries.map((entry, idx) => {
    const pr = prMap.get(entry.pullRequestId);
    const author = pr ? authorMap.get(pr.authorId) : undefined;
    const priority = entry.priority || 0;

    let priorityLane = "normal";
    if (priority >= PRIORITY_LANES.URGENT) priorityLane = "urgent";
    else if (priority >= PRIORITY_LANES.HIGH) priorityLane = "high";
    else if (priority <= PRIORITY_LANES.LOW) priorityLane = "low";

    const estimatedMinutes = (idx + 1) * avgCiTimeMinutes;
    const estimatedMergeAt = new Date(now + estimatedMinutes * 60 * 1000);
    const waitTimeMinutes = Math.round(
      (now - (entry.addedAt?.getTime() || now)) / (60 * 1000),
    );

    return {
      id: entry.id,
      position: idx + 1,
      priority,
      priorityLane,
      prNumber: pr?.number || 0,
      prTitle: pr?.title || "Unknown",
      headBranch: pr?.headBranch || "",
      baseBranch: pr?.baseBranch || "",
      author: author?.username || "unknown",
      ciStatus: entry.ciStatus || "pending",
      attemptCount: entry.attemptCount || 0,
      addedAt: entry.addedAt || new Date(),
      estimatedMergeAt,
      waitTimeMinutes,
    };
  });
}

/**
 * Get queue statistics for a repository
 */
export async function getQueueStats(repositoryId: string): Promise<{
  pending: number;
  merging: number;
  merged24h: number;
  failed24h: number;
  avgMergeTimeMinutes: number;
  urgentCount: number;
}> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const allItems = await db.query.mergeQueue.findMany({
    where: eq(schema.mergeQueue.repositoryId, repositoryId),
  });

  const pending = allItems.filter((i) => i.status === "pending").length;
  const merging = allItems.filter((i) => i.status === "merging").length;
  const recent = allItems.filter(
    (i) => i.completedAt && i.completedAt >= oneDayAgo,
  );
  const merged24h = recent.filter((i) => i.status === "merged").length;
  const failed24h = recent.filter((i) => i.status === "failed").length;

  const mergeTimes = recent
    .filter((i) => i.status === "merged" && i.startedAt && i.completedAt)
    .map(
      (i) => (i.completedAt!.getTime() - i.startedAt!.getTime()) / (60 * 1000),
    );

  const avgMergeTimeMinutes =
    mergeTimes.length > 0
      ? Math.round(mergeTimes.reduce((a, b) => a + b, 0) / mergeTimes.length)
      : 10;

  const urgentCount = allItems.filter(
    (i) => i.status === "pending" && (i.priority || 0) >= PRIORITY_LANES.URGENT,
  ).length;

  return {
    pending,
    merging,
    merged24h,
    failed24h,
    avgMergeTimeMinutes,
    urgentCount,
  };
}
