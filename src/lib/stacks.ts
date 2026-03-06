/**
 * Stacked PRs Library
 * Core functions for managing stacked pull request workflows
 */

import { getDatabase, schema } from "@/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "./logger";
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
export async function createStack(
  options: CreateStackOptions,
): Promise<typeof schema.prStacks.$inferSelect> {
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

  if (entries.length === 0) {
    return { stack, entries: [] };
  }

  // Batch fetch all PRs in one query instead of N individual queries
  const prIds = entries.map((e) => e.pullRequestId);
  const prs = await db.query.pullRequests.findMany({
    where: inArray(schema.pullRequests.id, prIds),
  });
  const prMap = new Map(prs.map((pr) => [pr.id, pr]));

  const entriesWithPrs = entries
    .map((entry) => ({
      entry,
      pr: prMap.get(entry.pullRequestId)!,
    }))
    .filter((e) => e.pr != null);

  return { stack, entries: entriesWithPrs };
}

/**
 * Get stack for a specific PR
 */
export async function getStackForPr(
  pullRequestId: string,
): Promise<StackInfo | null> {
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
export async function addToStack(
  options: AddToStackOptions,
): Promise<typeof schema.prStackEntries.$inferSelect> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Get current max order in stack
  const existingEntries = await db.query.prStackEntries.findMany({
    where: eq(schema.prStackEntries.stackId, options.stackId),
    orderBy: [desc(schema.prStackEntries.stackOrder)],
  });

  const maxOrder =
    existingEntries.length > 0 ? existingEntries[0].stackOrder : 0;

  const entry = {
    id: generateId(),
    stackId: options.stackId,
    pullRequestId: options.pullRequestId,
    stackOrder: maxOrder + 1,
    parentPrId: options.parentPrId || existingEntries[0]?.pullRequestId || null,
    createdAt: new Date(),
  };

  await db.insert(schema.prStackEntries).values(entry);

  // Update stack timestamp
  await db
    .update(schema.prStacks)
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
  await db
    .delete(schema.prStackEntries)
    .where(eq(schema.prStackEntries.pullRequestId, pullRequestId));

  // Update order of remaining entries
  const remainingEntries = await db.query.prStackEntries.findMany({
    where: eq(schema.prStackEntries.stackId, entry.stackId),
    orderBy: [asc(schema.prStackEntries.stackOrder)],
  });

  // Re-number and update parent references
  for (let i = 0; i < remainingEntries.length; i++) {
    const parentPrId = i > 0 ? remainingEntries[i - 1].pullRequestId : null;
    await db
      .update(schema.prStackEntries)
      .set({ stackOrder: i + 1, parentPrId })
      .where(eq(schema.prStackEntries.id, remainingEntries[i].id));
  }

  // If stack is now empty, mark it as closed
  if (remainingEntries.length === 0) {
    await db
      .update(schema.prStacks)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(schema.prStacks.id, entry.stackId));
  }
}

/**
 * Reorder PRs within a stack
 */
export async function reorderStack(
  stackId: string,
  newOrder: string[],
): Promise<void> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  for (let i = 0; i < newOrder.length; i++) {
    const parentPrId = i > 0 ? newOrder[i - 1] : null;

    await db
      .update(schema.prStackEntries)
      .set({ stackOrder: i + 1, parentPrId })
      .where(
        and(
          eq(schema.prStackEntries.stackId, stackId),
          eq(schema.prStackEntries.pullRequestId, newOrder[i]),
        ),
      );
  }

  await db
    .update(schema.prStacks)
    .set({ updatedAt: new Date() })
    .where(eq(schema.prStacks.id, stackId));
}

/**
 * Get all active stacks for a repository
 */
export async function getRepositoryStacks(
  repositoryId: string,
): Promise<Array<StackInfo>> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const stacks = await db.query.prStacks.findMany({
    where: and(
      eq(schema.prStacks.repositoryId, repositoryId),
      eq(schema.prStacks.status, "active"),
    ),
    orderBy: [desc(schema.prStacks.updatedAt)],
  });

  if (stacks.length === 0) return [];

  // Batch fetch all entries for all stacks in one query
  const stackIds = stacks.map((s) => s.id);
  const allEntries = await db.query.prStackEntries.findMany({
    where: inArray(schema.prStackEntries.stackId, stackIds),
    orderBy: [asc(schema.prStackEntries.stackOrder)],
  });

  // Batch fetch all referenced PRs in one query
  const prIds = [...new Set(allEntries.map((e) => e.pullRequestId))];
  const allPrs =
    prIds.length > 0
      ? await db.query.pullRequests.findMany({
          where: inArray(schema.pullRequests.id, prIds),
        })
      : [];
  const prMap = new Map(allPrs.map((pr) => [pr.id, pr]));

  // Group entries by stack in memory
  const entriesByStack = new Map<string, typeof allEntries>();
  for (const entry of allEntries) {
    const list = entriesByStack.get(entry.stackId) || [];
    list.push(entry);
    entriesByStack.set(entry.stackId, list);
  }

  return stacks.map((stack) => ({
    stack,
    entries: (entriesByStack.get(stack.id) || [])
      .map((entry) => ({
        entry,
        pr: prMap.get(entry.pullRequestId)!,
      }))
      .filter((e) => e.pr != null),
  }));
}

/**
 * Check if a PR can be stacked on another PR
 */
export async function canStackOn(
  prId: string,
  targetPrId: string,
): Promise<boolean> {
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
  const anyClosed = stackInfo.entries.some(
    ({ pr }) => pr.state === "closed" && !pr.isMerged,
  );

  let newStatus = "active";
  if (allMerged) {
    newStatus = "merged";
  } else if (anyClosed) {
    newStatus = "closed";
  }

  if (newStatus !== stackInfo.stack.status) {
    await db
      .update(schema.prStacks)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(schema.prStacks.id, stackId));
  }
}

/**
 * Auto-rebase child PRs when a base PR in the stack is merged.
 * Called after a PR merge — finds stack children and rebases them
 * onto the new base (the branch the merged PR targeted).
 */
export async function autoRebaseStackChildren(
  mergedPrId: string,
): Promise<{ rebased: string[]; failed: string[] }> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const rebased: string[] = [];
  const failed: string[] = [];

  // Find stack entry for this PR
  const stackEntry = await db.query.prStackEntries.findFirst({
    where: eq(schema.prStackEntries.pullRequestId, mergedPrId),
  });

  if (!stackEntry) return { rebased, failed };

  const stackInfo = await getStack(stackEntry.stackId);
  if (!stackInfo) return { rebased, failed };

  // Find the merged PR in the stack
  const mergedEntry = stackInfo.entries.find(
    ({ entry }) => entry.pullRequestId === mergedPrId,
  );
  if (!mergedEntry) return { rebased, failed };

  const mergedPr = mergedEntry.pr;

  // Find direct children: PRs whose parentPrId is the merged PR
  const children = stackInfo.entries.filter(
    ({ entry }) => entry.parentPrId === mergedPrId,
  );

  if (children.length === 0) return { rebased, failed };

  // Get repo info for git operations
  const repo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.id, mergedPr.repositoryId),
    with: { owner: true },
  });

  if (!repo) return { rebased, failed };

  const { simpleGit } = await import("simple-git");
  const { acquireRepo, releaseRepo } = await import("./git-storage");

  try {
    const repoPath = await acquireRepo(repo.owner.username, repo.name);
    const git = simpleGit(repoPath);
    await git.fetch(["--all"]);

    for (const { entry, pr } of children) {
      if (pr.state !== "open" || pr.isMerged) continue;

      try {
        // Update the child PR's base branch to the merged PR's base branch
        // (since the merged PR's head is now part of the base branch)
        await db
          .update(schema.pullRequests)
          .set({ baseBranch: mergedPr.baseBranch, updatedAt: new Date() })
          .where(eq(schema.pullRequests.id, pr.id));

        // Update parent pointer: child now points to next PR or null
        await db
          .update(schema.prStackEntries)
          .set({ parentPrId: mergedEntry.entry.parentPrId })
          .where(
            and(
              eq(schema.prStackEntries.stackId, stackEntry.stackId),
              eq(schema.prStackEntries.pullRequestId, pr.id),
            ),
          );

        // Attempt git rebase
        try {
          await git.rebase([
            "--onto",
            `origin/${mergedPr.baseBranch}`,
            `origin/${mergedPr.headBranch}`,
            pr.headBranch,
          ]);
          await git.push(["origin", pr.headBranch, "--force-with-lease"]);
          rebased.push(pr.headBranch);
        } catch (rebaseErr) {
          // Rebase conflict — abort and log
          try {
            await git.rebase(["--abort"]);
          } catch (_) {
            /* ignore abort errors */
          }
          failed.push(pr.headBranch);
          logger.warn(
            { pr: pr.number, branch: pr.headBranch },
            "Auto-rebase failed due to conflicts",
          );
        }
      } catch (err) {
        failed.push(pr.headBranch);
        logger.error({ err, pr: pr.number }, "Stack auto-rebase error");
      }
    }

    await releaseRepo(repo.owner.username, repo.name, false);
  } catch (err) {
    logger.error({ err }, "Failed to acquire repo for stack auto-rebase");
  }

  // Update stack status
  await updateStackStatus(stackEntry.stackId);

  return { rebased, failed };
}

/**
 * Merge an entire stack bottom-up.
 * Merges PRs in stack order, auto-rebasing each subsequent PR
 * after its predecessor merges.
 */
export async function mergeStack(
  stackId: string,
  mergedById: string,
  mergeMethod: "merge" | "squash" | "rebase" = "merge",
): Promise<{ merged: number[]; failed: number[]; skipped: number[] }> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const merged: number[] = [];
  const failed: number[] = [];
  const skipped: number[] = [];

  const stackInfo = await getStack(stackId);
  if (!stackInfo) throw new Error("Stack not found");

  // Process in stack order (bottom-up)
  const sortedEntries = [...stackInfo.entries].sort(
    (a, b) => a.entry.stackOrder - b.entry.stackOrder,
  );

  for (const { pr } of sortedEntries) {
    if (pr.isMerged) {
      skipped.push(pr.number);
      continue;
    }

    if (pr.state !== "open") {
      skipped.push(pr.number);
      continue;
    }

    try {
      // Dynamic import to avoid circular dependency
      const { mergePullRequest } = await import("./pull-requests");
      await mergePullRequest(pr.id, mergedById, mergeMethod);
      merged.push(pr.number);

      // After merging, auto-rebase children
      await autoRebaseStackChildren(pr.id);
    } catch (err) {
      logger.error({ err, pr: pr.number }, "Stack merge failed for PR");
      failed.push(pr.number);
      // Stop merging — can't continue if a PR in the middle fails
      break;
    }
  }

  await updateStackStatus(stackId);

  return { merged, failed, skipped };
}

/**
 * Detect conflicts across a stack.
 * Checks if any PR in the stack would conflict if merged in order.
 */
export async function detectStackConflicts(
  stackId: string,
): Promise<Array<{ prNumber: number; conflictsWith: number[] }>> {
  const stackInfo = await getStack(stackId);
  if (!stackInfo) return [];

  const conflicts: Array<{ prNumber: number; conflictsWith: number[] }> = [];

  // Get changed files per PR
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const sortedEntries = [...stackInfo.entries].sort(
    (a, b) => a.entry.stackOrder - b.entry.stackOrder,
  );

  const changedFilesMap = new Map<string, Set<string>>();

  for (const { pr } of sortedEntries) {
    if (pr.isMerged || pr.state !== "open") continue;

    try {
      const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, pr.repositoryId),
        with: { owner: true },
      });

      if (!repo) continue;

      const { simpleGit } = await import("simple-git");
      const { acquireRepo, releaseRepo } = await import("./git-storage");
      const repoPath = await acquireRepo(repo.owner.username, repo.name);
      const git = simpleGit(repoPath);
      await git.fetch();

      const diffSummary = await git.diffSummary([
        `origin/${pr.baseBranch}...origin/${pr.headBranch}`,
      ]);

      const files = new Set(diffSummary.files.map((f) => f.file));
      changedFilesMap.set(pr.id, files);

      await releaseRepo(repo.owner.username, repo.name, false);
    } catch {
      changedFilesMap.set(pr.id, new Set());
    }
  }

  // Check for file overlaps
  const prList = sortedEntries.filter(
    ({ pr }) => !pr.isMerged && pr.state === "open",
  );

  for (let i = 0; i < prList.length; i++) {
    const pr1 = prList[i];
    const files1 = changedFilesMap.get(pr1.pr.id) || new Set();
    const conflictsWith: number[] = [];

    for (let j = i + 1; j < prList.length; j++) {
      const pr2 = prList[j];
      const files2 = changedFilesMap.get(pr2.pr.id) || new Set();

      // Check intersection
      for (const f of files1) {
        if (files2.has(f)) {
          conflictsWith.push(pr2.pr.number);
          break;
        }
      }
    }

    if (conflictsWith.length > 0) {
      conflicts.push({ prNumber: pr1.pr.number, conflictsWith });
    }
  }

  return conflicts;
}
