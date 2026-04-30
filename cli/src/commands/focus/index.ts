import chalk from "chalk";
import { spawn } from "child_process";
import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { simpleGit } from "simple-git";
import {
  deleteWithAuth,
  getWithAuth,
  patchWithAuth,
  postWithAuth,
} from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";
import {
  formatBadge,
  formatRelativeTime,
  printMetricStrip,
  printSectionHeader,
  renderPanel,
  truncateText,
} from "../../lib/formatter.js";
import { getRepoInfoFromGit } from "../../lib/git.js";
import {
  getManagedStackBranches,
  getParentBranch,
  type StackNode,
  syncTrackedStack,
} from "../../lib/stack-manager.js";

const git = simpleGit();

interface FocusPullRequest {
  id: string;
  number: number;
  title: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  sourceBranch: string;
  targetBranch: string;
  isDraft?: boolean;
  mergeableState?: string | null;
  commentCount?: number;
  reviewerCount?: number;
  queueEntryId?: string | null;
  queueStatus?: string | null;
  author: {
    username: string;
  };
}

interface FocusQueueItem {
  id: string;
  position: number;
  status: string;
  priority: number;
  addedAt: string;
  estimatedMergeTime?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  failureReason?: string | null;
  ciStatus?: string | null;
  pullRequest: {
    id?: string;
    number: number;
    title: string;
    sourceBranch: string;
    targetBranch: string;
    author: {
      username: string;
    };
  };
}

interface FocusRoutingCandidate {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role: string;
  pendingReviewCount: number;
}

interface FocusRepoListItem {
  id: string;
  name: string;
  fullName: string;
  updatedAt: string;
  owner: {
    username: string;
  };
}

interface FocusStackApiItem {
  id: string;
  name: string;
  status: string;
  baseBranch: string;
  updatedAt: string;
  entries: Array<{
    id: string;
    stackOrder: number;
    pullRequest: {
      id: string;
      number: number;
      title: string;
      headBranch: string;
      baseBranch: string;
      state: string;
      isMerged?: boolean;
      isDraft?: boolean;
    };
  }>;
}

interface FocusStackApprovalStatus {
  allApproved: boolean;
  summary: {
    totalPrs: number;
    approvedPrs: number;
    pendingPrs: number;
    totalMissingApprovals: number;
    totalMissingRequiredReviewerApprovals: number;
  };
  prs: Array<{
    prId: string;
    prNumber: number;
    title: string;
    isApproved: boolean;
    approvalCount: number;
    requiredApprovals: number;
    missingApprovals: number;
    changesRequested: boolean;
    missingRequiredReviewers: Array<{
      userId: string;
      username?: string;
    }>;
  }>;
}

interface FocusStackApprovalsPayload {
  status: FocusStackApprovalStatus;
  canMerge: boolean;
  blockers: string[];
  recommendedReviewers: string[];
  nextActions: {
    shouldRequestApprovals: boolean;
    pendingPrs: number;
  };
}

interface FocusStackApprovalRequestResult {
  dryRun: boolean;
  requested: string[];
  skipped: string[];
  notFound: string[];
  requestedDuplicates: number;
}

interface FocusStackMergeReadinessPayload {
  stackId: string;
  canMerge: boolean;
  blockers: string[];
  approvalStatus: FocusStackApprovalStatus | null;
}

interface FocusStackMergeExecutionResult {
  success: boolean;
  merged: Array<{ prId: string; prNumber: number }>;
  failed: Array<{ prId: string; prNumber: number; reason: string }>;
  skipped: Array<{ prId: string; prNumber: number; reason: string }>;
}

interface FocusActiveStack {
  repoId: string;
  stack: FocusStackApiItem;
}

interface FocusReviewerHint {
  id: string;
  username: string;
  displayName?: string | null;
  role: string;
  pendingReviewCount: number;
  isRecommended: boolean;
}

interface FocusQueueHealth {
  total: number;
  ready: number;
  pending: number;
  running: number;
  merging: number;
  failed: number;
  failedItems: FocusQueueItem[];
  activeStackTotal: number;
  activeStackQueued: number;
  activeStackReady: number;
  activeStackPending: number;
  activeStackInFlight: number;
  activeStackFailed: number;
  entriesAheadOfStack: number | null;
  headItem: FocusQueueItem | null;
}

interface FocusCrossRepoQueueSummary {
  repoLabel: string;
  repoName: string;
  updatedAt: string;
  isCurrentRepo: boolean;
  total: number;
  ready: number;
  pending: number;
  running: number;
  merging: number;
  failed: number;
  headItem: FocusQueueItem | null;
}

type FocusQueuePressureFilter = "all" | "active-only" | "failed-only";

type FocusQueuePressureSort =
  | "pressure"
  | "failed"
  | "queue-size"
  | "ready"
  | "updated";

interface FocusQueuePressureView {
  filter: FocusQueuePressureFilter;
  sort: FocusQueuePressureSort;
}

interface FocusStackQueuePlanItem {
  prId: string;
  prNumber: number;
  title: string;
  headBranch: string;
  baseBranch: string;
  action: "queue" | "already-queued" | "skip";
  reason?: string;
  priority?: number;
  existingQueuePosition?: number;
}

interface FocusStackQueueResult {
  queued: Array<{ prNumber: number; priority: number; position?: number }>;
  reprioritized: Array<{ prNumber: number; priority: number }>;
  removed: number[];
  retried: number[];
  skipped: Array<{ prNumber: number; reason: string }>;
  failed: Array<{ prNumber: number; reason: string }>;
}

interface FocusSnapshot {
  repoOwner: string;
  repoName: string;
  repoLabel: string;
  currentBranch: string;
  currentParentBranch: string | null;
  currentPr: FocusPullRequest | null;
  openPullRequests: FocusPullRequest[];
  queueItems: FocusQueueItem[];
  currentQueueItem: FocusQueueItem | null;
  queueHealth: FocusQueueHealth;
  crossRepoQueueSummaries: FocusCrossRepoQueueSummary[];
  stackBranches: StackNode[];
  activeStack: FocusActiveStack | null;
  activeStackApprovals: FocusStackApprovalsPayload | null;
  reviewerHints: FocusReviewerHint[];
}

interface FocusNotice {
  title: string;
  lines: string[];
  tone: "success" | "info" | "warning" | "danger" | "accent" | "neutral";
}

type FocusShortcutAction =
  | "queue"
  | "queue-manage"
  | "queue-preview"
  | "queue-pressure"
  | "stack-queue"
  | "sync"
  | "approve"
  | "request-changes"
  | "comment"
  | "ai-review"
  | "merge"
  | "close"
  | "view-diff"
  | "assign-reviewer"
  | "checkout"
  | "copy-pr"
  | "open-pr"
  | "stack-approvals"
  | "stack-merge"
  | "refresh"
  | "exit";

export const focusCommand = new Command("focus")
  .description("Interactive stack and review cockpit")
  .option("--json", "Print the current focus snapshot as JSON")
  .option(
    "--no-interactive",
    "Render one snapshot without interactive shortcuts",
  )
  .action(async (options) => {
    const config = getConfig();
    if (!config.token) {
      renderPanel({
        eyebrow: "Focus",
        title: "Authentication required",
        subtitle: "Sign in before launching the terminal review cockpit.",
        lines: ["Run 'och auth login --url <server>' and retry."],
        tone: "danger",
      });
      process.exit(1);
    }

    const interactive =
      options.interactive !== false &&
      !options.json &&
      Boolean(process.stdout.isTTY && process.stdin.isTTY);

    let notice: FocusNotice | null = null;
    let queuePressureView: FocusQueuePressureView = {
      filter: "all",
      sort: "pressure",
    };

    while (true) {
      try {
        const snapshot = await loadFocusSnapshot();

        if (options.json) {
          console.log(JSON.stringify(snapshot, null, 2));
          return;
        }

        if (interactive && process.stdout.isTTY) {
          console.clear();
        }

        renderFocusSnapshot(snapshot, notice, queuePressureView);
        notice = null;

        if (!interactive) {
          return;
        }

        const action = await promptForShortcut(snapshot);
        if (action === "exit") {
          return;
        }

        if (action === "refresh") {
          continue;
        }

        if (action === "queue-pressure") {
          const result = await runQueuePressureControlsShortcut(
            queuePressureView,
            snapshot,
          );
          queuePressureView = result.view;
          notice = result.notice;
          continue;
        }

        notice = await runShortcut(action, snapshot);
      } catch (error) {
        renderPanel({
          eyebrow: "Focus",
          title: "Could not load terminal focus view",
          subtitle: error instanceof Error ? error.message : "Unknown error",
          lines: [
            "Make sure you are inside a Git repository connected to OpenCodeHub and try again.",
          ],
          tone: "danger",
        });
        process.exit(1);
      }
    }
  });

async function loadFocusSnapshot(): Promise<FocusSnapshot> {
  const repoInfo = await getRepoInfoFromGit(git);
  if (!repoInfo) {
    throw new Error("Could not determine repository from Git origin.");
  }

  const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
  const [
    openPullRequestsResult,
    queueItemsResult,
    stackBranches,
    currentParentBranch,
  ] = await Promise.all([
    getWithAuth<{ data: FocusPullRequest[] }>(
      `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls?state=open&limit=20`,
    ),
    getWithAuth<{ data: FocusQueueItem[] | { queue?: FocusQueueItem[] } }>(
      `/api/repos/${repoInfo.owner}/${repoInfo.repo}/queue`,
    ),
    getManagedStackBranches(git),
    getParentBranch(git, currentBranch),
  ]);

  const openPullRequests = [...openPullRequestsResult.data].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const queueItems = extractQueueItems(queueItemsResult.data);
  const currentPr =
    openPullRequests.find((pr) => pr.sourceBranch === currentBranch) || null;
  const currentQueueItem = currentPr
    ? queueItems.find((item) => item.pullRequest.number === currentPr.number) ||
      null
    : null;
  const activeStack = await resolveActiveStack({
    repoOwner: repoInfo.owner,
    repoName: repoInfo.repo,
    currentBranch,
    stackBranches,
  });
  const [activeStackApprovals, reviewerHints] = await Promise.all([
    loadStackApprovalHints(repoInfo.owner, repoInfo.repo, activeStack),
    loadReviewerHints(repoInfo.owner, repoInfo.repo, activeStack),
  ]);
  const queueHealth = buildQueueHealth(queueItems, activeStack);
  const crossRepoQueueSummaries = await loadCrossRepoQueueSummaries({
    repoOwner: repoInfo.owner,
    repoName: repoInfo.repo,
  });

  return {
    repoOwner: repoInfo.owner,
    repoName: repoInfo.repo,
    repoLabel: `${repoInfo.owner}/${repoInfo.repo}`,
    currentBranch,
    currentParentBranch,
    currentPr,
    openPullRequests,
    queueItems,
    currentQueueItem,
    queueHealth,
    crossRepoQueueSummaries,
    stackBranches,
    activeStack,
    activeStackApprovals,
    reviewerHints,
  };
}

async function loadStackApprovalHints(
  repoOwner: string,
  repoName: string,
  activeStack: FocusActiveStack | null,
): Promise<FocusStackApprovalsPayload | null> {
  if (!activeStack) {
    return null;
  }

  try {
    const result = await getWithAuth<{ data: FocusStackApprovalsPayload }>(
      `/api/repos/${repoOwner}/${repoName}/stacks/${activeStack.stack.id}/approvals`,
    );
    return result.data;
  } catch {
    return null;
  }
}

async function loadRoutingCandidatesForRepo(
  repoOwner: string,
  repoName: string,
): Promise<FocusRoutingCandidate[]> {
  const result = await getWithAuth<{
    data: FocusRoutingCandidate[] | { candidates?: FocusRoutingCandidate[] };
  }>(`/api/repos/${repoOwner}/${repoName}/pulls/reviewer-routing`);

  if (Array.isArray(result.data)) {
    return result.data;
  }

  return Array.isArray(result.data.candidates) ? result.data.candidates : [];
}

async function loadReviewerHints(
  repoOwner: string,
  repoName: string,
  activeStack: FocusActiveStack | null,
): Promise<FocusReviewerHint[]> {
  try {
    const [candidates, approvals] = await Promise.all([
      loadRoutingCandidatesForRepo(repoOwner, repoName),
      loadStackApprovalHints(repoOwner, repoName, activeStack),
    ]);
    const recommended = new Set(approvals?.recommendedReviewers || []);

    return [...candidates]
      .sort((left, right) => {
        const leftRecommended = recommended.has(left.username) ? 0 : 1;
        const rightRecommended = recommended.has(right.username) ? 0 : 1;
        if (leftRecommended !== rightRecommended) {
          return leftRecommended - rightRecommended;
        }
        if (left.pendingReviewCount !== right.pendingReviewCount) {
          return left.pendingReviewCount - right.pendingReviewCount;
        }
        return left.username.localeCompare(right.username);
      })
      .slice(0, 6)
      .map((candidate) => ({
        id: candidate.id,
        username: candidate.username,
        displayName: candidate.displayName,
        role: candidate.role,
        pendingReviewCount: candidate.pendingReviewCount,
        isRecommended: recommended.has(candidate.username),
      }));
  } catch {
    return [];
  }
}

function getStackEntryForPr(
  snapshot: FocusSnapshot,
  prNumber: number,
): FocusStackApiItem["entries"][number] | null {
  return (
    snapshot.activeStack?.stack.entries.find(
      (entry) => entry.pullRequest.number === prNumber,
    ) || null
  );
}

function isQueueFailedStatus(status: string) {
  return status === "failed";
}

function isQueueInFlightStatus(status: string) {
  return status === "running_ci" || status === "merging";
}

function isQueueActiveStatus(status: string) {
  return (
    status === "pending" || status === "ready" || isQueueInFlightStatus(status)
  );
}

function getActiveStackQueueItems(
  queueItems: FocusQueueItem[],
  activeStack: FocusActiveStack | null,
) {
  if (!activeStack) {
    return [] as FocusQueueItem[];
  }

  const stackPrNumbers = new Set(
    activeStack.stack.entries.map((entry) => entry.pullRequest.number),
  );
  return queueItems.filter((item) =>
    stackPrNumbers.has(item.pullRequest.number),
  );
}

function buildQueueHealth(
  queueItems: FocusQueueItem[],
  activeStack: FocusActiveStack | null,
): FocusQueueHealth {
  const failedItems = queueItems.filter((item) =>
    isQueueFailedStatus(item.status),
  );
  const headItem =
    [...queueItems].sort((left, right) => left.position - right.position)[0] ||
    null;
  const stackQueueItems = getActiveStackQueueItems(queueItems, activeStack);
  const activeQueueableStackEntries =
    activeStack?.stack.entries.filter(
      (entry) =>
        entry.pullRequest.state === "open" && !entry.pullRequest.isMerged,
    ) || [];
  const activeStackActiveItems = stackQueueItems.filter((item) =>
    isQueueActiveStatus(item.status),
  );
  const firstStackPosition = activeStackActiveItems.length
    ? Math.min(...activeStackActiveItems.map((item) => item.position))
    : null;

  return {
    total: queueItems.length,
    ready: queueItems.filter((item) => item.status === "ready").length,
    pending: queueItems.filter((item) => item.status === "pending").length,
    running: queueItems.filter((item) => item.status === "running_ci").length,
    merging: queueItems.filter((item) => item.status === "merging").length,
    failed: failedItems.length,
    failedItems,
    activeStackTotal: activeQueueableStackEntries.length,
    activeStackQueued: activeStackActiveItems.length,
    activeStackReady: stackQueueItems.filter((item) => item.status === "ready")
      .length,
    activeStackPending: stackQueueItems.filter(
      (item) => item.status === "pending",
    ).length,
    activeStackInFlight: stackQueueItems.filter((item) =>
      isQueueInFlightStatus(item.status),
    ).length,
    activeStackFailed: stackQueueItems.filter((item) =>
      isQueueFailedStatus(item.status),
    ).length,
    entriesAheadOfStack:
      firstStackPosition === null
        ? activeQueueableStackEntries.length > 0
          ? queueItems.length
          : null
        : queueItems.filter((item) => item.position < firstStackPosition)
            .length,
    headItem,
  };
}

function buildFocusStackQueuePlan(
  activeStack: FocusActiveStack,
  queueItems: FocusQueueItem[],
  basePriority: number,
) {
  const activeQueueEntries = new Map(
    queueItems
      .filter((item) => isQueueActiveStatus(item.status))
      .map((item) => [item.pullRequest.number, item] as const),
  );
  const queueableEntries = activeStack.stack.entries.filter(
    (entry) =>
      entry.pullRequest.state === "open" && !entry.pullRequest.isMerged,
  );

  return activeStack.stack.entries.map((entry) => {
    const pr = entry.pullRequest;
    const existing = activeQueueEntries.get(pr.number);
    if (existing) {
      return {
        prId: pr.id,
        prNumber: pr.number,
        title: pr.title,
        headBranch: pr.headBranch,
        baseBranch: pr.baseBranch,
        action: "already-queued",
        existingQueuePosition: existing.position,
      } satisfies FocusStackQueuePlanItem;
    }

    if (pr.state !== "open") {
      return {
        prId: pr.id,
        prNumber: pr.number,
        title: pr.title,
        headBranch: pr.headBranch,
        baseBranch: pr.baseBranch,
        action: "skip",
        reason: `PR is ${pr.state}`,
      } satisfies FocusStackQueuePlanItem;
    }

    if (pr.isMerged) {
      return {
        prId: pr.id,
        prNumber: pr.number,
        title: pr.title,
        headBranch: pr.headBranch,
        baseBranch: pr.baseBranch,
        action: "skip",
        reason: "already merged",
      } satisfies FocusStackQueuePlanItem;
    }

    const queueableIndex = queueableEntries.findIndex(
      (queueable) => queueable.pullRequest.id === pr.id,
    );
    const priority = Math.max(
      0,
      Math.min(
        100,
        basePriority + (queueableEntries.length - queueableIndex - 1),
      ),
    );

    return {
      prId: pr.id,
      prNumber: pr.number,
      title: pr.title,
      headBranch: pr.headBranch,
      baseBranch: pr.baseBranch,
      action: "queue",
      priority,
    } satisfies FocusStackQueuePlanItem;
  });
}

function buildStackQueuePlanLines(plan: FocusStackQueuePlanItem[]) {
  return plan.map((item) => {
    if (item.action === "queue") {
      return `#${item.prNumber} ${truncateText(item.title, 58)} • ${item.headBranch} → ${item.baseBranch} • queue at priority ${item.priority}`;
    }

    if (item.action === "already-queued") {
      return `#${item.prNumber} ${truncateText(item.title, 58)} • already queued at position ${item.existingQueuePosition ?? "?"}`;
    }

    return `#${item.prNumber} ${truncateText(item.title, 58)} • skipped: ${item.reason || "not queueable"}`;
  });
}

function getDefaultStackQueuePriority(queueItems: FocusQueueItem[]) {
  if (queueItems.length === 0) {
    return 20;
  }

  return Math.max(...queueItems.map((item) => item.priority));
}

function getQueueStatusTone(status: string) {
  if (status === "ready") {
    return "success" as const;
  }

  if (isQueueFailedStatus(status)) {
    return "danger" as const;
  }

  if (isQueueInFlightStatus(status)) {
    return "accent" as const;
  }

  return "warning" as const;
}

function formatQueueHeadDetail(item: FocusQueueItem | null) {
  if (!item) {
    return "Queue head   unavailable";
  }

  const statusText = item.status.replace(/_/g, " ");
  const ciText = item.ciStatus
    ? ` • CI ${item.ciStatus.replace(/_/g, " ")}`
    : "";
  const timeText = item.startedAt
    ? ` • started ${formatRelativeTime(item.startedAt)}`
    : ` • added ${formatRelativeTime(item.addedAt)}`;

  return `Queue head   #${item.pullRequest.number} ${truncateText(item.pullRequest.title, 46)} • ${statusText} • priority ${item.priority}${ciText}${timeText}`;
}

function buildFailedQueuePreviewLines(queueHealth: FocusQueueHealth) {
  return queueHealth.failedItems.slice(0, 2).map((item) => {
    const reason =
      item.failureReason?.trim() || "No failure reason recorded yet.";
    const finishedText = item.completedAt
      ? ` • ${formatRelativeTime(item.completedAt)}`
      : "";
    return `Failures     #${item.pullRequest.number} ${truncateText(reason, 72)}${finishedText}`;
  });
}

function getQueuePressureFilterLabel(filter: FocusQueuePressureFilter) {
  switch (filter) {
    case "active-only":
      return "active repos";
    case "failed-only":
      return "failed repos";
    default:
      return "all repos";
  }
}

function getQueuePressureSortLabel(sort: FocusQueuePressureSort) {
  switch (sort) {
    case "failed":
      return "failed count";
    case "queue-size":
      return "queue size";
    case "ready":
      return "ready count";
    case "updated":
      return "recent update";
    default:
      return "pressure score";
  }
}

function getVisibleCrossRepoQueueSummaries(
  summaries: FocusCrossRepoQueueSummary[],
  view: FocusQueuePressureView,
) {
  const filtered = summaries.filter((repo) => {
    if (repo.isCurrentRepo) {
      return true;
    }

    if (view.filter === "active-only") {
      return repo.total > 0;
    }

    if (view.filter === "failed-only") {
      return repo.failed > 0;
    }

    return true;
  });

  const sorted = [...filtered].sort((left, right) => {
    if (left.isCurrentRepo !== right.isCurrentRepo) {
      return left.isCurrentRepo ? -1 : 1;
    }

    if (view.sort === "failed") {
      if (right.failed !== left.failed) {
        return right.failed - left.failed;
      }
    } else if (view.sort === "queue-size") {
      if (right.total !== left.total) {
        return right.total - left.total;
      }
    } else if (view.sort === "ready") {
      if (right.ready !== left.ready) {
        return right.ready - left.ready;
      }
    } else if (view.sort === "updated") {
      return right.updatedAt.localeCompare(left.updatedAt);
    } else {
      const leftPressure = left.failed * 100 + left.total * 10 + left.ready;
      const rightPressure = right.failed * 100 + right.total * 10 + right.ready;
      if (rightPressure !== leftPressure) {
        return rightPressure - leftPressure;
      }
    }

    if (right.total !== left.total) {
      return right.total - left.total;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });

  return sorted;
}

async function loadCrossRepoQueueSummaries(input: {
  repoOwner: string;
  repoName: string;
}): Promise<FocusCrossRepoQueueSummary[]> {
  try {
    const reposResult = await getWithAuth<{
      data: FocusRepoListItem[];
    }>(
      `/api/repos?owner=${encodeURIComponent(input.repoOwner)}&sort=updated&perPage=8`,
    );

    const repos = reposResult.data
      .filter((repo) => repo.owner.username === input.repoOwner)
      .slice(0, 8);

    const queueSummaries = await Promise.all(
      repos.map(async (repo) => {
        try {
          const queueResult = await getWithAuth<{
            data: FocusQueueItem[] | { queue?: FocusQueueItem[] };
          }>(`/api/repos/${repo.owner.username}/${repo.name}/queue`);
          const queueItems = extractQueueItems(queueResult.data);
          return {
            repoLabel: repo.fullName,
            repoName: repo.name,
            updatedAt: repo.updatedAt,
            isCurrentRepo: repo.name === input.repoName,
            total: queueItems.length,
            ready: queueItems.filter((item) => item.status === "ready").length,
            pending: queueItems.filter((item) => item.status === "pending")
              .length,
            running: queueItems.filter((item) => item.status === "running_ci")
              .length,
            merging: queueItems.filter((item) => item.status === "merging")
              .length,
            failed: queueItems.filter((item) =>
              isQueueFailedStatus(item.status),
            ).length,
            headItem:
              [...queueItems].sort(
                (left, right) => left.position - right.position,
              )[0] || null,
          } satisfies FocusCrossRepoQueueSummary;
        } catch {
          return {
            repoLabel: repo.fullName,
            repoName: repo.name,
            updatedAt: repo.updatedAt,
            isCurrentRepo: repo.name === input.repoName,
            total: 0,
            ready: 0,
            pending: 0,
            running: 0,
            merging: 0,
            failed: 0,
            headItem: null,
          } satisfies FocusCrossRepoQueueSummary;
        }
      }),
    );

    return queueSummaries.sort((left, right) => {
      const leftPressure = left.failed * 100 + left.total;
      const rightPressure = right.failed * 100 + right.total;
      if (left.isCurrentRepo !== right.isCurrentRepo) {
        return left.isCurrentRepo ? -1 : 1;
      }
      if (rightPressure !== leftPressure) {
        return rightPressure - leftPressure;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  } catch {
    return [];
  }
}

function buildQueueEntryPreviewLines(
  item: FocusQueueItem,
  snapshot: FocusSnapshot,
) {
  const stackEntry = getStackEntryForPr(snapshot, item.pullRequest.number);
  const url = buildPrUrl(snapshot, item.pullRequest.number);

  return [
    `Status      ${item.status.replace(/_/g, " ")}`,
    `Priority    ${item.priority} • queue position ${item.position}`,
    `CI          ${item.ciStatus ? item.ciStatus.replace(/_/g, " ") : "unknown"}`,
    `Queued      ${formatRelativeTime(item.addedAt)}`,
    item.startedAt
      ? `Started     ${formatRelativeTime(item.startedAt)}`
      : "Started     not started yet",
    item.completedAt
      ? `Completed   ${formatRelativeTime(item.completedAt)}`
      : "Completed   still active or waiting",
    stackEntry
      ? `Stack lane  order ${stackEntry.stackOrder} • ${stackEntry.pullRequest.headBranch} → ${stackEntry.pullRequest.baseBranch}`
      : `Branches    ${item.pullRequest.sourceBranch} → ${item.pullRequest.targetBranch}`,
    item.failureReason?.trim()
      ? `Failure     ${item.failureReason.trim()}`
      : "Failure     none recorded",
    `Link        ${url}`,
  ];
}

async function resolveActiveStack(input: {
  repoOwner: string;
  repoName: string;
  currentBranch: string;
  stackBranches: StackNode[];
}): Promise<FocusActiveStack | null> {
  if (input.stackBranches.length === 0) {
    return null;
  }

  try {
    const repoResult = await getWithAuth<{ data: { id: string } }>(
      `/api/repos/${input.repoOwner}/${input.repoName}`,
    );
    const stacksResult = await getWithAuth<{
      data: { stacks: FocusStackApiItem[] };
    }>(`/api/stacks?repositoryId=${encodeURIComponent(repoResult.data.id)}`);

    const trackedBranches = new Set(
      input.stackBranches.map((node) => node.branch),
    );
    const rankedStacks = stacksResult.data.stacks
      .map((stack) => {
        const matchScore = stack.entries.reduce((score, entry) => {
          let next = score;
          if (trackedBranches.has(entry.pullRequest.headBranch)) {
            next += 3;
          }
          if (entry.pullRequest.headBranch === input.currentBranch) {
            next += 2;
          }
          return next;
        }, 0);

        return { stack, matchScore };
      })
      .filter((item) => item.matchScore > 0)
      .sort((left, right) => {
        if (right.matchScore !== left.matchScore) {
          return right.matchScore - left.matchScore;
        }

        return right.stack.updatedAt.localeCompare(left.stack.updatedAt);
      });

    const stack = rankedStacks[0]?.stack || null;
    return stack
      ? {
          repoId: repoResult.data.id,
          stack,
        }
      : null;
  } catch {
    return null;
  }
}

function extractQueueItems(
  payload: FocusQueueItem[] | { queue?: FocusQueueItem[] },
): FocusQueueItem[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  return Array.isArray(payload.queue) ? payload.queue : [];
}

function renderFocusSnapshot(
  snapshot: FocusSnapshot,
  notice: FocusNotice | null,
  queuePressureView: FocusQueuePressureView,
): void {
  if (notice) {
    renderPanel({
      eyebrow: "Last action",
      title: notice.title,
      lines: notice.lines,
      tone: notice.tone,
    });
  }

  const readyQueueCount = snapshot.queueItems.filter(
    (item) => item.status === "ready",
  ).length;

  printSectionHeader(
    snapshot.repoLabel,
    "One command surface for stack sync, queue control, and review approval.",
    "Focus",
  );
  printMetricStrip([
    {
      label: "branch",
      value: truncateText(snapshot.currentBranch, 18),
      tone: "accent",
    },
    {
      label: "open prs",
      value: snapshot.openPullRequests.length,
      tone: "info",
    },
    { label: "queued", value: snapshot.queueItems.length, tone: "warning" },
    { label: "queue ready", value: readyQueueCount, tone: "success" },
    {
      label: "stack branches",
      value: snapshot.stackBranches.length,
      tone: "accent",
    },
  ]);

  renderPanel({
    eyebrow: "Current branch",
    title: snapshot.currentBranch,
    subtitle: snapshot.currentPr
      ? `${formatBadge(`#${snapshot.currentPr.number}`, "info")} ${snapshot.currentPr.title}`
      : "No open pull request is linked to this branch right now.",
    lines: [
      snapshot.currentParentBranch
        ? `Parent      ${snapshot.currentParentBranch}`
        : "Parent      not tracked",
      snapshot.currentPr
        ? `Review      ${snapshot.currentPr.reviewerCount ?? 0} reviewers • ${snapshot.currentPr.commentCount ?? 0} comments • updated ${formatRelativeTime(snapshot.currentPr.updatedAt)}`
        : "Review      create or reopen a PR to attach quick actions here",
      snapshot.currentQueueItem
        ? `Queue       position ${snapshot.currentQueueItem.position} • ${snapshot.currentQueueItem.status.replace(/_/g, " ")} • priority ${snapshot.currentQueueItem.priority}`
        : "Queue       not currently staged in merge queue",
    ],
    tone: snapshot.currentPr ? "info" : "neutral",
  });

  renderPanel({
    eyebrow: "Queue health",
    title:
      snapshot.queueHealth.total > 0
        ? `${snapshot.queueHealth.total} merge-lane entries`
        : "Merge queue idle",
    subtitle:
      snapshot.queueHealth.activeStackTotal > 0
        ? `Active stack coverage ${snapshot.queueHealth.activeStackQueued}/${snapshot.queueHealth.activeStackTotal} queueable PRs`
        : "Repository queue pressure stays visible alongside the tracked stack lane.",
    lines:
      snapshot.queueHealth.total > 0
        ? [
            `Repo lane    ${snapshot.queueHealth.ready} ready • ${snapshot.queueHealth.pending} pending • ${snapshot.queueHealth.running} running CI • ${snapshot.queueHealth.merging} merging • ${snapshot.queueHealth.failed} failed`,
            formatQueueHeadDetail(snapshot.queueHealth.headItem),
            snapshot.activeStack
              ? `Stack lane   ${snapshot.queueHealth.activeStackQueued}/${snapshot.queueHealth.activeStackTotal} queued • ${snapshot.queueHealth.activeStackReady} ready • ${snapshot.queueHealth.activeStackPending} pending • ${snapshot.queueHealth.activeStackInFlight} in flight • ${snapshot.queueHealth.activeStackFailed} failed`
              : "Stack lane   attach tracked branches to a remote stack for stack-specific queue hints",
            snapshot.queueHealth.entriesAheadOfStack === null
              ? "Load hint    no active stack queue position yet"
              : snapshot.queueHealth.activeStackQueued > 0
                ? `Load hint    ${snapshot.queueHealth.entriesAheadOfStack} repo entr${snapshot.queueHealth.entriesAheadOfStack === 1 ? "y" : "ies"} sit ahead of the first queued stack PR`
                : `Load hint    ${snapshot.queueHealth.entriesAheadOfStack} repo entr${snapshot.queueHealth.entriesAheadOfStack === 1 ? "y" : "ies"} are already in lane before this stack is queued`,
            ...buildFailedQueuePreviewLines(snapshot.queueHealth),
          ]
        : [
            snapshot.activeStack
              ? `Stack lane   ${snapshot.queueHealth.activeStackQueued}/${snapshot.queueHealth.activeStackTotal} active stack PRs are already staged`
              : "Stack lane   no remote stack matched the tracked branches yet",
            "Load hint    the merge lane is open for the next queue action.",
          ],
    tone:
      snapshot.queueHealth.failed > 0
        ? "danger"
        : snapshot.queueHealth.running > 0 || snapshot.queueHealth.merging > 0
          ? "warning"
          : snapshot.queueHealth.total > 0
            ? "success"
            : "neutral",
  });

  const visibleCrossRepoQueueSummaries = getVisibleCrossRepoQueueSummaries(
    snapshot.crossRepoQueueSummaries,
    queuePressureView,
  );
  const siblingPressureRepos = visibleCrossRepoQueueSummaries.filter(
    (repo) => !repo.isCurrentRepo && repo.total > 0,
  );
  const failedSiblingRepos = visibleCrossRepoQueueSummaries.filter(
    (repo) => !repo.isCurrentRepo && repo.failed > 0,
  );

  renderPanel({
    eyebrow: "Cross-repo queue pressure",
    title:
      visibleCrossRepoQueueSummaries.length > 1
        ? `${visibleCrossRepoQueueSummaries.length} repos in ${snapshot.repoOwner}`
        : `No sibling repos discovered under ${snapshot.repoOwner}`,
    subtitle:
      visibleCrossRepoQueueSummaries.length > 1
        ? `Showing ${getQueuePressureFilterLabel(queuePressureView.filter)} sorted by ${getQueuePressureSortLabel(queuePressureView.sort)}.`
        : "The current owner namespace has no other repos with queued work right now.",
    lines:
      visibleCrossRepoQueueSummaries.length > 1
        ? visibleCrossRepoQueueSummaries.slice(0, 5).map((repo) => {
            const marker = repo.isCurrentRepo
              ? formatBadge("current", "accent")
              : formatBadge("repo", "muted");
            const head = repo.headItem
              ? ` • head #${repo.headItem.pullRequest.number} ${truncateText(repo.headItem.pullRequest.title, 26)}`
              : "";
            return `${marker} ${repo.repoLabel} • ${repo.total} queued • ${repo.ready} ready • ${repo.pending} pending • ${repo.failed} failed${head}`;
          })
        : [
            "Refresh after other repositories under this owner namespace start using the merge queue.",
          ],
    footer:
      visibleCrossRepoQueueSummaries.length > 1
        ? `Queue pressure controls: filter ${getQueuePressureFilterLabel(queuePressureView.filter)} • sort ${getQueuePressureSortLabel(queuePressureView.sort)} • ${siblingPressureRepos.length} active sibling repos • ${failedSiblingRepos.length} failed sibling repos.`
        : undefined,
    tone: siblingPressureRepos.some((repo) => repo.failed > 0)
      ? "warning"
      : siblingPressureRepos.length > 0
        ? "info"
        : "neutral",
  });

  renderPanel({
    eyebrow: "Stack lane",
    title:
      snapshot.stackBranches.length > 0
        ? `${snapshot.stackBranches.length} tracked branches`
        : "No tracked stack branches",
    subtitle:
      snapshot.stackBranches.length > 0
        ? "Parents are shown first so rebases stay predictable."
        : "Run 'och stack create <name>' to start a stack-first delivery lane.",
    lines:
      snapshot.stackBranches.length > 0
        ? snapshot.stackBranches.slice(0, 6).map((node) => {
            const marker = node.isCurrent
              ? formatBadge("current", "accent")
              : formatBadge("stack", "muted");
            return `${marker} ${node.branch}${node.parent ? ` • parent ${node.parent}` : ""}`;
          })
        : ["Use 'och stack submit' after syncing to keep PRs current."],
    tone: snapshot.stackBranches.length > 0 ? "accent" : "neutral",
  });

  renderPanel({
    eyebrow: "Stack cockpit",
    title: snapshot.activeStack
      ? `${snapshot.activeStack.stack.name} • ${snapshot.activeStack.stack.entries.length} PRs`
      : "No remote stack matched",
    subtitle: snapshot.activeStack
      ? "Run stack approvals or stack merge from the same focus loop."
      : "Run 'och stack submit' after syncing to attach the tracked branches to a remote stack.",
    lines: snapshot.activeStack
      ? snapshot.activeStack.stack.entries.slice(0, 5).map((entry) => {
          const pr = entry.pullRequest;
          const stateTone = pr.state === "open" ? "info" : "warning";
          return `${formatBadge(`#${pr.number}`, stateTone)} ${truncateText(pr.title, 68)} • ${pr.headBranch} → ${pr.baseBranch}`;
        })
      : [
          "Stack approval and merge shortcuts unlock after the tracked lane has a remote stack.",
        ],
    tone: snapshot.activeStack ? "info" : "neutral",
  });

  renderPanel({
    eyebrow: "Reviewer hints",
    title:
      snapshot.reviewerHints.length > 0
        ? `${snapshot.reviewerHints.length} load-aware candidates`
        : "No reviewer hints available",
    subtitle: snapshot.activeStackApprovals?.recommendedReviewers?.length
      ? `Stack recommendations: ${snapshot.activeStackApprovals.recommendedReviewers.join(", ")}`
      : "Reviewer hints favor lower pending-review counts and stack recommendations when available.",
    lines:
      snapshot.reviewerHints.length > 0
        ? snapshot.reviewerHints.map((candidate) => {
            const loadTone =
              candidate.pendingReviewCount <= 2
                ? "success"
                : candidate.pendingReviewCount <= 5
                  ? "warning"
                  : "danger";
            const recommendedBadge = candidate.isRecommended
              ? ` ${formatBadge("recommended", "accent")}`
              : "";
            return `${formatBadge(candidate.role, "muted")} ${candidate.displayName || `@${candidate.username}`}${recommendedBadge} • @${candidate.username} • ${formatBadge(String(candidate.pendingReviewCount), loadTone)} pending reviews`;
          })
        : [
            snapshot.activeStack
              ? "Reviewer routing hints will appear here once candidates are available."
              : "Attach the current lane to a remote stack for stack-aware reviewer hints.",
          ],
    tone: snapshot.reviewerHints.length > 0 ? "accent" : "neutral",
  });

  renderPanel({
    eyebrow: "Review lane",
    title:
      snapshot.openPullRequests.length > 0
        ? `${snapshot.openPullRequests.length} open pull requests`
        : "No open pull requests",
    subtitle:
      snapshot.openPullRequests.length > 0
        ? "Most recently updated PRs stay closest to the terminal cockpit."
        : "Open pull requests appear here for fast queue and review actions.",
    lines:
      snapshot.openPullRequests.length > 0
        ? snapshot.openPullRequests.slice(0, 5).map((pr) => {
            const stackEntry = getStackEntryForPr(snapshot, pr.number);
            const queueBadge = snapshot.queueItems.some(
              (item) => item.pullRequest.number === pr.number,
            )
              ? formatBadge("queued", "warning")
              : formatBadge(
                  pr.isDraft ? "draft" : "open",
                  pr.isDraft ? "muted" : "success",
                );
            const stackBadge = stackEntry
              ? ` ${formatBadge(`stack ${stackEntry.stackOrder}`, "accent")}`
              : "";
            return `${formatBadge(`#${pr.number}`, "info")} ${queueBadge}${stackBadge} ${truncateText(pr.title, 72)} • @${pr.author.username} • ${pr.reviewerCount ?? 0} reviewers • ${formatRelativeTime(pr.updatedAt)}`;
          })
        : ["Refresh after creating or fetching repository pull requests."],
    footer:
      "Shortcuts: queue, queue manage, stack queue, sync, approve, request changes, comment, AI review, merge, close, diff, reviewer assign, checkout, copy PR refs, stack approvals, stack merge, open current PR, or refresh.",
    tone: snapshot.openPullRequests.length > 0 ? "success" : "neutral",
  });
}

async function promptForShortcut(snapshot: FocusSnapshot) {
  const hasQueueablePr = snapshot.openPullRequests.length > 0;
  const hasQueuedPr = snapshot.queueItems.length > 0;
  const hasApprovablePr = snapshot.openPullRequests.length > 0;
  const hasReviewablePr = snapshot.openPullRequests.length > 0;
  const hasMergeablePr = snapshot.openPullRequests.length > 0;
  const hasClosablePr = snapshot.openPullRequests.length > 0;
  const hasDiffablePr = snapshot.openPullRequests.length > 0;
  const hasReviewerAssignablePr = snapshot.openPullRequests.length > 0;
  const hasCheckoutablePr = snapshot.openPullRequests.length > 0;
  const hasCopyablePr = snapshot.openPullRequests.length > 0;
  const hasStackBranches = snapshot.stackBranches.length > 0;
  const hasCurrentPr = Boolean(snapshot.currentPr);
  const hasActiveStack = Boolean(snapshot.activeStack);

  const { action } = await inquirer.prompt<{
    action: FocusShortcutAction;
  }>([
    {
      type: "list",
      name: "action",
      message: "Quick action",
      choices: [
        {
          name: hasQueueablePr
            ? "Queue or dequeue a pull request"
            : "Queue or dequeue a pull request (no open PRs)",
          value: "queue",
          disabled: hasQueueablePr ? false : "No open PRs available",
        },
        {
          name: hasQueuedPr
            ? "Reprioritize or remove a queued pull request"
            : "Reprioritize or remove a queued pull request (queue empty)",
          value: "queue-manage",
          disabled: hasQueuedPr ? false : "No queued PRs available",
        },
        {
          name: hasQueuedPr
            ? "Preview a queue entry"
            : "Preview a queue entry (queue empty)",
          value: "queue-preview",
          disabled: hasQueuedPr ? false : "No queued PRs available",
        },
        {
          name:
            snapshot.crossRepoQueueSummaries.length > 1
              ? "Adjust cross-repo queue pressure view"
              : "Adjust cross-repo queue pressure view (no sibling repos)",
          value: "queue-pressure",
          disabled:
            snapshot.crossRepoQueueSummaries.length > 1
              ? false
              : "No sibling repositories are available",
        },
        {
          name: hasActiveStack
            ? "Manage merge lane for the current stack"
            : "Manage merge lane for the current stack (no remote stack)",
          value: "stack-queue",
          disabled: hasActiveStack
            ? false
            : "No remote stack matched the tracked branches",
        },
        {
          name: hasStackBranches
            ? "Sync tracked stack branches"
            : "Sync tracked stack branches (no stack branches)",
          value: "sync",
          disabled: hasStackBranches ? false : "No tracked stack branches",
        },
        {
          name: hasApprovablePr
            ? "Approve a pull request"
            : "Approve a pull request (no open PRs)",
          value: "approve",
          disabled: hasApprovablePr ? false : "No open PRs available",
        },
        {
          name: hasReviewablePr
            ? "Request changes on a pull request"
            : "Request changes on a pull request (no open PRs)",
          value: "request-changes",
          disabled: hasReviewablePr ? false : "No open PRs available",
        },
        {
          name: hasReviewablePr
            ? "Add a review comment"
            : "Add a review comment (no open PRs)",
          value: "comment",
          disabled: hasReviewablePr ? false : "No open PRs available",
        },
        {
          name: hasReviewablePr
            ? "Trigger AI review"
            : "Trigger AI review (no open PRs)",
          value: "ai-review",
          disabled: hasReviewablePr ? false : "No open PRs available",
        },
        {
          name: hasMergeablePr
            ? "Merge a pull request"
            : "Merge a pull request (no open PRs)",
          value: "merge",
          disabled: hasMergeablePr ? false : "No open PRs available",
        },
        {
          name: hasClosablePr
            ? "Close a pull request"
            : "Close a pull request (no open PRs)",
          value: "close",
          disabled: hasClosablePr ? false : "No open PRs available",
        },
        {
          name: hasDiffablePr
            ? "View a pull request diff"
            : "View a pull request diff (no open PRs)",
          value: "view-diff",
          disabled: hasDiffablePr ? false : "No open PRs available",
        },
        {
          name: hasReviewerAssignablePr
            ? "Assign a reviewer"
            : "Assign a reviewer (no open PRs)",
          value: "assign-reviewer",
          disabled: hasReviewerAssignablePr ? false : "No open PRs available",
        },
        {
          name: hasCheckoutablePr
            ? "Checkout a selected PR branch"
            : "Checkout a selected PR branch (no open PRs)",
          value: "checkout",
          disabled: hasCheckoutablePr ? false : "No open PRs available",
        },
        {
          name: hasCopyablePr
            ? "Copy PR URL or number"
            : "Copy PR URL or number (no open PRs)",
          value: "copy-pr",
          disabled: hasCopyablePr ? false : "No open PRs available",
        },
        {
          name: hasActiveStack
            ? "Inspect stack approvals or request reviewers"
            : "Inspect stack approvals or request reviewers (no remote stack)",
          value: "stack-approvals",
          disabled: hasActiveStack
            ? false
            : "No remote stack matched the tracked branches",
        },
        {
          name: hasActiveStack
            ? "Queue merge for the current stack"
            : "Queue merge for the current stack (no remote stack)",
          value: "stack-merge",
          disabled: hasActiveStack
            ? false
            : "No remote stack matched the tracked branches",
        },
        {
          name: hasCurrentPr
            ? "Open current pull request in browser"
            : "Open current pull request in browser (no linked PR)",
          value: "open-pr",
          disabled: hasCurrentPr ? false : "Current branch has no open PR",
        },
        { name: "Refresh snapshot", value: "refresh" },
        { name: "Exit focus view", value: "exit" },
      ],
      pageSize: 16,
    },
  ]);

  return action;
}

async function runShortcut(
  action: Exclude<FocusShortcutAction, "refresh" | "exit" | "queue-pressure">,
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  switch (action) {
    case "queue":
      return runQueueShortcut(snapshot);
    case "queue-manage":
      return runQueueManageShortcut(snapshot);
    case "queue-preview":
      return runQueuePreviewShortcut(snapshot);
    case "stack-queue":
      return runStackQueueShortcut(snapshot);
    case "sync":
      return runSyncShortcut();
    case "approve":
      return runApproveShortcut(snapshot);
    case "request-changes":
      return runRequestChangesShortcut(snapshot);
    case "comment":
      return runCommentShortcut(snapshot);
    case "ai-review":
      return runAiReviewShortcut(snapshot);
    case "merge":
      return runMergeShortcut(snapshot);
    case "close":
      return runCloseShortcut(snapshot);
    case "view-diff":
      return runViewDiffShortcut(snapshot);
    case "assign-reviewer":
      return runAssignReviewerShortcut(snapshot);
    case "checkout":
      return runCheckoutShortcut(snapshot);
    case "copy-pr":
      return runCopyShortcut(snapshot);
    case "stack-approvals":
      return runStackApprovalsShortcut(snapshot);
    case "stack-merge":
      return runStackMergeShortcut(snapshot);
    case "open-pr":
      return runOpenCurrentPrShortcut(snapshot);
  }
}

async function runQueuePressureControlsShortcut(
  currentView: FocusQueuePressureView,
  snapshot: FocusSnapshot,
): Promise<{ view: FocusQueuePressureView; notice: FocusNotice }> {
  const { filter, sort } = await inquirer.prompt<{
    filter: FocusQueuePressureFilter;
    sort: FocusQueuePressureSort;
  }>([
    {
      type: "list",
      name: "filter",
      message: "Cross-repo queue filter",
      default: currentView.filter,
      choices: [
        { name: "Show all repos", value: "all" },
        { name: "Show repos with active queue pressure", value: "active-only" },
        { name: "Show repos with failures only", value: "failed-only" },
      ],
    },
    {
      type: "list",
      name: "sort",
      message: "Cross-repo queue sort",
      default: currentView.sort,
      choices: [
        { name: "Pressure score", value: "pressure" },
        { name: "Failed count", value: "failed" },
        { name: "Queue size", value: "queue-size" },
        { name: "Ready count", value: "ready" },
        { name: "Recently updated", value: "updated" },
      ],
    },
  ]);

  const view = { filter, sort } satisfies FocusQueuePressureView;
  const visible = getVisibleCrossRepoQueueSummaries(
    snapshot.crossRepoQueueSummaries,
    view,
  );

  return {
    view,
    notice: {
      title: "Cross-repo queue view updated",
      lines: [
        `Filter: ${getQueuePressureFilterLabel(filter)}.`,
        `Sort: ${getQueuePressureSortLabel(sort)}.`,
        `Visible repos: ${visible.length}.`,
      ],
      tone: "info",
    },
  };
}

function parseReviewerCsv(input?: string) {
  if (!input) return [] as string[];
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function loadStackApprovalsPayload(
  snapshot: FocusSnapshot,
): Promise<FocusStackApprovalsPayload> {
  if (!snapshot.activeStack) {
    throw new Error("No remote stack matched the tracked branches.");
  }

  const result = await getWithAuth<{ data: FocusStackApprovalsPayload }>(
    `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/stacks/${snapshot.activeStack.stack.id}/approvals`,
  );
  return result.data;
}

async function runStackApprovalsShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  if (!snapshot.activeStack) {
    return {
      title: "No remote stack matched",
      lines: [
        "Run 'och stack submit' to attach the tracked branches to a remote stack before using stack approval shortcuts.",
      ],
      tone: "neutral",
    };
  }

  const spinner = ora("Loading stack approvals...").start();
  try {
    let approvals = await loadStackApprovalsPayload(snapshot);
    spinner.stop();

    const { action } = await inquirer.prompt<{
      action: "summary" | "recommended" | "custom" | "preview";
    }>([
      {
        type: "list",
        name: "action",
        message: `Stack approval action for ${snapshot.activeStack.stack.name}`,
        choices: [
          { name: "Show approval summary", value: "summary" },
          {
            name:
              approvals.recommendedReviewers.length > 0
                ? `Request recommended reviewers (${approvals.recommendedReviewers.join(", ")})`
                : "Request recommended reviewers (none available)",
            value: "recommended",
            disabled:
              approvals.recommendedReviewers.length > 0
                ? false
                : "No recommended reviewers available",
          },
          { name: "Request custom reviewers", value: "custom" },
          { name: "Preview reviewer eligibility", value: "preview" },
        ],
      },
    ]);

    if (action === "summary") {
      return {
        title: `${snapshot.activeStack.stack.name} approval summary`,
        lines: [
          `${approvals.status.summary.approvedPrs}/${approvals.status.summary.totalPrs} PRs approved.`,
          `${approvals.status.summary.pendingPrs} PRs still need approval work.`,
          approvals.blockers.length > 0
            ? `Top blocker: ${approvals.blockers[0]}`
            : "No current approval blockers.",
          ...approvals.status.prs.slice(0, 4).map((pr) => {
            const extra = pr.changesRequested
              ? " • changes requested"
              : pr.missingRequiredReviewers.length > 0
                ? ` • required: ${pr.missingRequiredReviewers.map((reviewer) => reviewer.username || reviewer.userId).join(", ")}`
                : "";
            return `#${pr.prNumber} ${pr.approvalCount}/${pr.requiredApprovals}${extra}`;
          }),
        ],
        tone: approvals.canMerge ? "success" : "warning",
      };
    }

    let reviewers: string[] = [];
    let dryRun = false;

    if (action === "recommended") {
      reviewers = approvals.recommendedReviewers;
    } else {
      const answer = await inquirer.prompt<{ reviewers: string }>([
        {
          type: "input",
          name: "reviewers",
          message:
            action === "preview"
              ? "Reviewer usernames to preview (comma-separated)"
              : "Reviewer usernames to request (comma-separated)",
          default:
            approvals.recommendedReviewers.length > 0
              ? approvals.recommendedReviewers.join(",")
              : "",
          validate: (value) =>
            parseReviewerCsv(value).length > 0 ||
            "Enter at least one reviewer username",
        },
      ]);
      reviewers = parseReviewerCsv(answer.reviewers);
      dryRun = action === "preview";
    }

    const requestSpinner = ora(
      dryRun
        ? "Previewing reviewer eligibility..."
        : "Requesting stack reviewers...",
    ).start();
    const requestResult = await postWithAuth<{
      data: FocusStackApprovalRequestResult;
    }>(
      `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/stacks/${snapshot.activeStack.stack.id}/approvals`,
      {
        reviewers,
        dryRun,
      },
    );
    requestSpinner.stop();

    if (!dryRun) {
      approvals = await loadStackApprovalsPayload(snapshot);
    }

    const result = requestResult.data;
    const summaryLines = [
      result.requested.length > 0
        ? `${dryRun ? "Eligible" : "Requested"}: ${result.requested.join(", ")}`
        : dryRun
          ? "Eligible: none"
          : "Requested: none",
      result.skipped.length > 0
        ? `No access: ${result.skipped.join(", ")}`
        : "No access issues detected.",
      result.notFound.length > 0
        ? `Not found: ${result.notFound.join(", ")}`
        : "All reviewer names resolved.",
      approvals.blockers.length > 0
        ? `Top blocker: ${approvals.blockers[0]}`
        : "No current approval blockers.",
    ];

    if (result.requestedDuplicates > 0) {
      summaryLines.push(
        `Ignored duplicate names: ${result.requestedDuplicates}`,
      );
    }

    return {
      title: dryRun ? "Stack reviewer preview" : "Stack reviewers updated",
      lines: summaryLines,
      tone: result.requested.length > 0 ? "success" : "warning",
    };
  } catch (error) {
    spinner.fail("Failed to load stack approvals.");
    return {
      title: "Stack approvals failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runStackMergeShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  if (!snapshot.activeStack) {
    return {
      title: "No remote stack matched",
      lines: [
        "Run 'och stack submit' to attach the tracked branches to a remote stack before using stack merge shortcuts.",
      ],
      tone: "neutral",
    };
  }

  const spinner = ora("Loading stack merge readiness...").start();
  try {
    const readinessResult = await getWithAuth<{
      data: FocusStackMergeReadinessPayload;
    }>(
      `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/stacks/${snapshot.activeStack.stack.id}/merge-readiness`,
    );
    spinner.stop();

    const readiness = readinessResult.data;
    const { mergeMethod, skipApprovalCheck, confirm } = await inquirer.prompt<{
      mergeMethod: "merge" | "squash" | "rebase";
      skipApprovalCheck: boolean;
      confirm: boolean;
    }>([
      {
        type: "list",
        name: "mergeMethod",
        message: `Merge method for ${snapshot.activeStack.stack.name}`,
        default: "merge",
        choices: ["merge", "squash", "rebase"],
      },
      {
        type: "confirm",
        name: "skipApprovalCheck",
        message: "Skip approval checks? (repository admin only)",
        default: false,
      },
      {
        type: "confirm",
        name: "confirm",
        message: readiness.canMerge
          ? `Queue merge for ${snapshot.activeStack.stack.name}?`
          : `Queue merge for ${snapshot.activeStack.stack.name} even though blockers are present?`,
        default: false,
      },
    ]);

    if (!confirm) {
      return {
        title: "Stack merge cancelled",
        lines: [`Left ${snapshot.activeStack.stack.name} unchanged.`],
        tone: "neutral",
      };
    }

    if (!readiness.canMerge && !skipApprovalCheck) {
      return {
        title: "Stack merge blocked",
        lines: [
          readiness.blockers[0] ||
            "Approval blockers must be resolved before merge.",
          "Use the stack approval shortcut first, or retry with approval checks skipped if you have admin access.",
        ],
        tone: "danger",
      };
    }

    const mergeSpinner = ora("Queueing stack merge...").start();
    const mergeResponse = await postWithAuth<{
      data: FocusStackMergeExecutionResult;
    }>(
      `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/stacks/${snapshot.activeStack.stack.id}/merge`,
      {
        mergeMethod,
        skipApprovalCheck,
      },
    );
    mergeSpinner.stop();

    return {
      title: mergeResponse.data.success
        ? "Stack merge queued"
        : "Stack merge completed with issues",
      lines: [
        `${snapshot.activeStack.stack.name} used ${mergeMethod} merge strategy.`,
        `Queued ${mergeResponse.data.merged.length} PRs, failed ${mergeResponse.data.failed.length}, skipped ${mergeResponse.data.skipped.length}.`,
        ...(mergeResponse.data.failed.length > 0
          ? [
              `Top failure: PR #${mergeResponse.data.failed[0].prNumber} • ${mergeResponse.data.failed[0].reason}`,
            ]
          : []),
        ...(mergeResponse.data.skipped.length > 0
          ? [
              `Top skipped: PR #${mergeResponse.data.skipped[0].prNumber} • ${mergeResponse.data.skipped[0].reason}`,
            ]
          : []),
      ],
      tone: mergeResponse.data.failed.length > 0 ? "warning" : "success",
    };
  } catch (error) {
    spinner.fail("Failed to queue stack merge.");
    return {
      title: "Stack merge failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

function buildPrUrl(snapshot: FocusSnapshot, prNumber: number) {
  const config = getConfig();
  return `${config.serverUrl}/${snapshot.repoOwner}/${snapshot.repoName}/pulls/${prNumber}`;
}

function colorizeDiffLine(line: string) {
  if (line.startsWith("diff --git")) {
    return chalk.bold.cyan(line);
  }

  if (line.startsWith("@@")) {
    return chalk.magenta(line);
  }

  if (line.startsWith("+++ ") || line.startsWith("--- ")) {
    return chalk.bold(line);
  }

  if (line.startsWith("+")) {
    return chalk.green(line);
  }

  if (line.startsWith("-")) {
    return chalk.red(line);
  }

  return line;
}

function formatDiffForPager(
  targetPr: FocusPullRequest,
  diff: string,
  sourceBranch?: string,
  targetBranch?: string,
) {
  const headerLines = [
    chalk.bold(`OpenCodeHub diff • PR #${targetPr.number}`),
    chalk.hex("#94a3b8")(
      `${sourceBranch || targetPr.sourceBranch} → ${targetBranch || targetPr.targetBranch}`,
    ),
    chalk.hex("#94a3b8")(targetPr.title),
    "",
  ];

  return [...headerLines, ...diff.split("\n").map(colorizeDiffLine)].join("\n");
}

async function openContentInPager(content: string): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stdout.write(`${content}\n`);
    return;
  }

  const config = getConfig();
  const configuredPager = config.pager?.trim();
  const envPager = process.env.PAGER?.trim();
  const candidates = [
    configuredPager,
    envPager,
    "less -R -F -X",
    "more",
  ].filter((value): value is string => Boolean(value));

  let lastError: Error | null = null;

  for (const command of candidates) {
    const pagerResult = await new Promise<Error | null>((resolve) => {
      const child = spawn(command, {
        shell: true,
        stdio: ["pipe", "inherit", "inherit"],
        env: {
          ...process.env,
          LESS: process.env.LESS || "-R -F -X",
        },
      });

      child.on("error", (error) => {
        resolve(error instanceof Error ? error : new Error(String(error)));
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve(null);
          return;
        }

        resolve(new Error(`Pager exited with status ${code ?? "unknown"}.`));
      });

      child.stdin.write(content);
      child.stdin.end();
    });

    if (!pagerResult) {
      return;
    }

    lastError = pagerResult;
  }

  throw lastError || new Error("No supported pager command was available.");
}

function writeClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const candidates: Array<{ command: string; args: string[] }> =
      process.platform === "darwin"
        ? [{ command: "pbcopy", args: [] }]
        : process.platform === "win32"
          ? [{ command: "clip", args: [] }]
          : [
              { command: "wl-copy", args: [] },
              { command: "xclip", args: ["-selection", "clipboard"] },
              { command: "xsel", args: ["--clipboard", "--input"] },
            ];

    let index = 0;

    const tryNext = () => {
      if (index >= candidates.length) {
        reject(
          new Error(
            "No supported clipboard utility was found. Install wl-copy, xclip, or xsel, or copy manually from the recap.",
          ),
        );
        return;
      }

      const candidate = candidates[index++];
      const child = spawn(candidate.command, candidate.args, {
        stdio: ["pipe", "ignore", "ignore"],
      });

      child.on("error", () => {
        tryNext();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        tryNext();
      });

      child.stdin.write(text);
      child.stdin.end();
    };

    tryNext();
  });
}

async function submitReviewEvent(
  snapshot: FocusSnapshot,
  prNumber: number,
  event: "approve" | "request_changes" | "comment",
  body?: string,
) {
  return postWithAuth(
    `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/pulls/${prNumber}/reviews`,
    {
      event,
      body: body?.trim() || undefined,
    },
  );
}

async function runQueueShortcut(snapshot: FocusSnapshot): Promise<FocusNotice> {
  const targetPr = await promptForPullRequest(
    snapshot,
    "Choose a pull request to queue or dequeue",
  );

  const queueItem = snapshot.queueItems.find(
    (item) => item.pullRequest.number === targetPr.number,
  );

  if (queueItem) {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        default: true,
        message: `Remove PR #${targetPr.number} from the merge queue?`,
      },
    ]);

    if (!confirm) {
      return {
        title: "Queue action cancelled",
        lines: [`Left PR #${targetPr.number} in the merge queue.`],
        tone: "neutral",
      };
    }

    const spinner = ora(
      `Removing PR #${targetPr.number} from the merge queue...`,
    ).start();
    try {
      await deleteWithAuth(
        `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/queue?entryId=${encodeURIComponent(queueItem.id)}`,
      );
      spinner.succeed(`Removed PR #${targetPr.number} from the merge queue.`);
      return {
        title: "Pull request dequeued",
        lines: [
          `Removed PR #${targetPr.number} from ${snapshot.repoLabel}'s merge queue.`,
        ],
        tone: "success",
      };
    } catch (error) {
      spinner.fail("Failed to update merge queue.");
      return {
        title: "Queue update failed",
        lines: [error instanceof Error ? error.message : "Unknown error"],
        tone: "danger",
      };
    }
  }

  const answers = await inquirer.prompt<{
    priority: string;
    method: "merge" | "squash" | "rebase";
  }>([
    {
      type: "input",
      name: "priority",
      message: `Queue priority for PR #${targetPr.number}`,
      default: targetPr.number === snapshot.currentPr?.number ? "25" : "0",
      validate: (value) =>
        /^-?\d+$/.test(value.trim()) || "Priority must be a whole number",
    },
    {
      type: "list",
      name: "method",
      message: "Merge method",
      default: "merge",
      choices: ["merge", "squash", "rebase"],
    },
  ]);

  const spinner = ora(`Queueing PR #${targetPr.number}...`).start();
  try {
    const result = await postWithAuth<{
      data: {
        entry: {
          id: string;
          position: number;
          estimatedWait?: string;
        };
      };
    }>(`/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/queue`, {
      pullRequestId: targetPr.id,
      priority: Number(answers.priority),
      mergeMethod: answers.method,
    });
    spinner.succeed(
      `Queued PR #${targetPr.number} at position ${result.data.entry.position}.`,
    );
    return {
      title: "Pull request queued",
      lines: [
        `Queued PR #${targetPr.number} with ${answers.method} merge strategy at priority ${answers.priority}.`,
        result.data.entry.estimatedWait
          ? `Estimated wait ${result.data.entry.estimatedWait}.`
          : "Estimated wait is not available yet.",
      ],
      tone: "success",
    };
  } catch (error) {
    spinner.fail("Failed to queue pull request.");
    return {
      title: "Queue action failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runQueueManageShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  const actionableQueueItems = snapshot.queueItems.filter((item) =>
    isQueueActiveStatus(item.status),
  );
  const failedQueueItems = snapshot.queueItems.filter((item) =>
    isQueueFailedStatus(item.status),
  );

  const { action } = await inquirer.prompt<{
    action: "reprioritize" | "remove" | "retry" | "process";
  }>([
    {
      type: "list",
      name: "action",
      message: `${snapshot.repoLabel} queue control`,
      choices: [
        {
          name:
            actionableQueueItems.length > 0
              ? `Process next queue entry (${actionableQueueItems.length} active)`
              : "Process next queue entry (no active entries)",
          value: "process",
          disabled:
            actionableQueueItems.length > 0
              ? false
              : "No pending or ready queue entries are available",
        },
        {
          name:
            failedQueueItems.length > 0
              ? `Retry a failed queue entry (${failedQueueItems.length} failed)`
              : "Retry a failed queue entry (none failed)",
          value: "retry",
          disabled:
            failedQueueItems.length > 0
              ? false
              : "No failed queue entries are available",
        },
        {
          name:
            actionableQueueItems.length > 0
              ? "Reprioritize an active queue entry"
              : "Reprioritize an active queue entry (none active)",
          value: "reprioritize",
          disabled:
            actionableQueueItems.length > 0
              ? false
              : "No pending or ready queue entries are available",
        },
        { name: "Remove a queue entry", value: "remove" },
      ],
    },
  ]);

  if (action === "process") {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: "Process the next repository queue entry now?",
        default: false,
      },
    ]);

    if (!confirm) {
      return {
        title: "Queue processing cancelled",
        lines: ["Left the repository merge queue unchanged."],
        tone: "neutral",
      };
    }

    const spinner = ora("Processing next queue entry...").start();
    try {
      const result = await patchWithAuth<{
        data: {
          message?: string;
          result?: {
            processed: boolean;
            reason?: string;
            entry?: {
              pullRequestId?: string;
              position?: number;
              priority?: number;
            };
          };
        };
      }>(`/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/queue`, {
        action: "process",
      });
      spinner.stop();

      const processed = result.data.result?.processed === true;
      return {
        title: processed
          ? "Queue processing started"
          : "Queue processing did not advance",
        lines: [
          result.data.message ||
            result.data.result?.reason ||
            (processed
              ? "Started processing the highest-priority pending queue entry."
              : "The queue did not advance."),
          snapshot.queueHealth.headItem
            ? `Previous queue head was PR #${snapshot.queueHealth.headItem.pullRequest.number} at priority ${snapshot.queueHealth.headItem.priority}.`
            : "Refresh focus to inspect the next active queue head.",
        ],
        tone: processed ? "success" : "warning",
      };
    } catch (error) {
      spinner.fail("Failed to process queue entry.");
      return {
        title: "Queue processing failed",
        lines: [error instanceof Error ? error.message : "Unknown error"],
        tone: "danger",
      };
    }
  }

  if (action === "retry") {
    const targetItem = await promptForQueueItem(
      snapshot,
      "Choose a failed queue entry to retry",
      failedQueueItems,
    );

    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: `Retry failed queue entry for PR #${targetItem.pullRequest.number}?`,
        default: true,
      },
    ]);

    if (!confirm) {
      return {
        title: "Queue retry cancelled",
        lines: [
          `Left failed entry for PR #${targetItem.pullRequest.number} unchanged.`,
        ],
        tone: "neutral",
      };
    }

    const spinner = ora(
      `Retrying queue entry for PR #${targetItem.pullRequest.number}...`,
    ).start();
    try {
      await patchWithAuth(
        `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/queue`,
        {
          action: "retry",
          entryId: targetItem.id,
        },
      );
      spinner.succeed(`Retried PR #${targetItem.pullRequest.number}.`);
      return {
        title: "Queue entry retried",
        lines: [
          `Reset PR #${targetItem.pullRequest.number} to pending queue state.`,
          "Refresh focus to inspect the updated queue position and status.",
        ],
        tone: "success",
      };
    } catch (error) {
      spinner.fail("Failed to retry queue entry.");
      return {
        title: "Queue retry failed",
        lines: [error instanceof Error ? error.message : "Unknown error"],
        tone: "danger",
      };
    }
  }

  const targetItem = await promptForQueueItem(
    snapshot,
    action === "reprioritize"
      ? "Choose an active queue entry to reprioritize"
      : "Choose a queue entry to remove",
    action === "reprioritize" ? actionableQueueItems : snapshot.queueItems,
  );

  if (action === "remove") {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: `Remove PR #${targetItem.pullRequest.number} from the merge queue?`,
        default: true,
      },
    ]);

    if (!confirm) {
      return {
        title: "Queue removal cancelled",
        lines: [
          `Left PR #${targetItem.pullRequest.number} in the merge queue at priority ${targetItem.priority}.`,
        ],
        tone: "neutral",
      };
    }

    const spinner = ora(
      `Removing PR #${targetItem.pullRequest.number} from the merge queue...`,
    ).start();
    try {
      await deleteWithAuth(
        `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/queue?entryId=${encodeURIComponent(targetItem.id)}`,
      );
      spinner.succeed(
        `Removed PR #${targetItem.pullRequest.number} from queue.`,
      );
      return {
        title: "Queue entry removed",
        lines: [
          `Removed PR #${targetItem.pullRequest.number} from ${snapshot.repoLabel}'s merge queue.`,
        ],
        tone: "success",
      };
    } catch (error) {
      spinner.fail("Failed to remove queue entry.");
      return {
        title: "Queue removal failed",
        lines: [error instanceof Error ? error.message : "Unknown error"],
        tone: "danger",
      };
    }
  }

  const { mode } = await inquirer.prompt<{
    mode: "raise" | "lower" | "exact";
  }>([
    {
      type: "list",
      name: "mode",
      message: `How should PR #${targetItem.pullRequest.number} be reprioritized?`,
      choices: [
        {
          name: `Raise by 10 (${targetItem.priority} → ${Math.min(targetItem.priority + 10, 100)})`,
          value: "raise",
        },
        {
          name: `Lower by 10 (${targetItem.priority} → ${Math.max(targetItem.priority - 10, -100)})`,
          value: "lower",
        },
        { name: "Set an exact priority", value: "exact" },
      ],
    },
  ]);

  let nextPriority = targetItem.priority;
  if (mode === "raise") {
    nextPriority = Math.min(targetItem.priority + 10, 100);
  } else if (mode === "lower") {
    nextPriority = Math.max(targetItem.priority - 10, -100);
  } else {
    const { priority } = await inquirer.prompt<{ priority: string }>([
      {
        type: "input",
        name: "priority",
        message: `New queue priority for PR #${targetItem.pullRequest.number}`,
        default: String(targetItem.priority),
        validate: (value) => {
          if (!/^-?\d+$/.test(value.trim())) {
            return "Priority must be a whole number";
          }

          const parsed = Number(value.trim());
          if (parsed < -100 || parsed > 100) {
            return "Priority must stay between -100 and 100";
          }

          return true;
        },
      },
    ]);

    nextPriority = Number(priority.trim());
  }

  if (nextPriority === targetItem.priority) {
    return {
      title: "Queue priority unchanged",
      lines: [
        `PR #${targetItem.pullRequest.number} remains at priority ${targetItem.priority}.`,
      ],
      tone: "neutral",
    };
  }

  const spinner = ora(
    `Updating queue priority for PR #${targetItem.pullRequest.number}...`,
  ).start();
  try {
    await patchWithAuth(
      `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/queue`,
      {
        action: "reprioritize",
        entryId: targetItem.id,
        priority: nextPriority,
      },
    );
    spinner.succeed(
      `Updated PR #${targetItem.pullRequest.number} priority to ${nextPriority}.`,
    );
    return {
      title: "Queue reprioritized",
      lines: [
        `Updated PR #${targetItem.pullRequest.number} from priority ${targetItem.priority} to ${nextPriority}.`,
      ],
      tone: "success",
    };
  } catch (error) {
    spinner.fail("Failed to reprioritize queue entry.");
    return {
      title: "Queue reprioritization failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runQueuePreviewShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  const targetItem = await promptForQueueItem(
    snapshot,
    "Choose a queue entry to inspect",
  );

  const { action } = await inquirer.prompt<{
    action: "preview" | "open" | "copy-url" | "copy-number" | "copy-both";
  }>([
    {
      type: "list",
      name: "action",
      message: `Queue action for PR #${targetItem.pullRequest.number}`,
      choices: [
        { name: "Show queue entry preview", value: "preview" },
        { name: "Open queued PR in browser", value: "open" },
        { name: "Copy queued PR URL", value: "copy-url" },
        { name: "Copy queued PR number", value: "copy-number" },
        { name: "Copy queued PR URL and number", value: "copy-both" },
      ],
    },
  ]);

  const url = buildPrUrl(snapshot, targetItem.pullRequest.number);

  if (action === "open") {
    try {
      openUrlInBrowser(url);
      return {
        title: `Opened queued PR #${targetItem.pullRequest.number}`,
        lines: [
          `Opened queued PR #${targetItem.pullRequest.number} in your browser.`,
          url,
        ],
        tone: "success",
      };
    } catch (error) {
      return {
        title: "Open queued PR failed",
        lines: [error instanceof Error ? error.message : "Unknown error", url],
        tone: "danger",
      };
    }
  }

  if (action !== "preview") {
    const textToCopy =
      action === "copy-url"
        ? url
        : action === "copy-number"
          ? `#${targetItem.pullRequest.number}`
          : `#${targetItem.pullRequest.number}\n${url}`;

    try {
      await writeClipboard(textToCopy);
      return {
        title: `Copied queued PR #${targetItem.pullRequest.number}`,
        lines: [
          action === "copy-url"
            ? `Copied queued PR #${targetItem.pullRequest.number} URL to the clipboard.`
            : action === "copy-number"
              ? `Copied queued PR #${targetItem.pullRequest.number} number to the clipboard.`
              : `Copied queued PR #${targetItem.pullRequest.number} number and URL to the clipboard.`,
          textToCopy,
        ],
        tone: "success",
      };
    } catch (error) {
      return {
        title: "Copy queued PR failed",
        lines: [
          error instanceof Error ? error.message : "Unknown error",
          textToCopy,
        ],
        tone: "warning",
      };
    }
  }

  return {
    title: `Queue entry preview for PR #${targetItem.pullRequest.number}`,
    lines: buildQueueEntryPreviewLines(targetItem, snapshot),
    tone: getQueueStatusTone(targetItem.status),
  };
}

async function runStackQueueShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  if (!snapshot.activeStack) {
    return {
      title: "No remote stack matched",
      lines: [
        "Run 'och stack submit' to attach the tracked branches to a remote stack before managing its merge lane.",
      ],
      tone: "neutral",
    };
  }

  const spinner = ora("Loading stack merge-lane state...").start();
  try {
    const queueResult = await getWithAuth<{
      data: FocusQueueItem[] | { queue?: FocusQueueItem[] };
    }>(`/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/queue`);
    const queueItems = extractQueueItems(queueResult.data);
    const activeStackQueueItems = getActiveStackQueueItems(
      queueItems,
      snapshot.activeStack,
    );
    const queuedStackItems = activeStackQueueItems.filter((item) =>
      isQueueActiveStatus(item.status),
    );
    const failedStackItems = activeStackQueueItems.filter((item) =>
      isQueueFailedStatus(item.status),
    );
    spinner.stop();

    const { action } = await inquirer.prompt<{
      action: "preview" | "queue" | "reprioritize" | "remove" | "retry-failed";
    }>([
      {
        type: "list",
        name: "action",
        message: `Stack queue action for ${snapshot.activeStack.stack.name}`,
        choices: [
          { name: "Preview stack queue plan", value: "preview" },
          { name: "Queue missing stack pull requests", value: "queue" },
          {
            name:
              queuedStackItems.length > 0
                ? `Reprioritize queued stack pull requests (${queuedStackItems.length})`
                : "Reprioritize queued stack pull requests (none queued)",
            value: "reprioritize",
            disabled:
              queuedStackItems.length > 0
                ? false
                : "No queued stack PRs available",
          },
          {
            name:
              queuedStackItems.length > 0
                ? `Remove queued stack pull requests (${queuedStackItems.length})`
                : "Remove queued stack pull requests (none queued)",
            value: "remove",
            disabled:
              queuedStackItems.length > 0
                ? false
                : "No queued stack PRs available",
          },
          {
            name:
              failedStackItems.length > 0
                ? `Retry failed stack queue entries (${failedStackItems.length})`
                : "Retry failed stack queue entries (none failed)",
            value: "retry-failed",
            disabled:
              failedStackItems.length > 0
                ? false
                : "No failed stack queue entries available",
          },
        ],
      },
    ]);

    if (action === "preview" || action === "queue") {
      const { basePriority, mergeMethod } = await inquirer.prompt<{
        basePriority: string;
        mergeMethod: "merge" | "squash" | "rebase";
      }>([
        {
          type: "input",
          name: "basePriority",
          message: "Base queue priority for the stack lane",
          default: String(getDefaultStackQueuePriority(activeStackQueueItems)),
          validate: (value) => {
            if (!/^\d+$/.test(value.trim())) {
              return "Priority must be a whole number";
            }

            const parsed = Number(value.trim());
            if (parsed < 0 || parsed > 100) {
              return "Priority must stay between 0 and 100";
            }

            return true;
          },
        },
        {
          type: "list",
          name: "mergeMethod",
          message: "Merge method for queued stack PRs",
          default: "merge",
          choices: ["merge", "squash", "rebase"],
        },
      ]);

      const plan = buildFocusStackQueuePlan(
        snapshot.activeStack,
        queueItems,
        Number(basePriority),
      );
      const queueable = plan.filter((item) => item.action === "queue");
      const summaryLines = [
        `Queue now: ${queueable.length}`,
        `Already queued: ${plan.filter((item) => item.action === "already-queued").length}`,
        `Skipped: ${plan.filter((item) => item.action === "skip").length}`,
        `Merge method: ${mergeMethod}`,
        ...buildStackQueuePlanLines(plan).slice(0, 6),
      ];

      if (action === "preview" || queueable.length === 0) {
        return {
          title:
            action === "preview"
              ? `${snapshot.activeStack.stack.name} queue preview`
              : "Stack already covered by the merge lane",
          lines:
            queueable.length === 0
              ? [
                  ...summaryLines,
                  "No additional stack PRs need to be queued right now.",
                ]
              : summaryLines,
          tone: queueable.length > 0 ? "info" : "neutral",
        };
      }

      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
        {
          type: "confirm",
          name: "confirm",
          message: `Queue ${queueable.length} stack PRs into the merge lane?`,
          default: false,
        },
      ]);

      if (!confirm) {
        return {
          title: "Stack queue cancelled",
          lines: [
            `Left ${snapshot.activeStack.stack.name} out of the merge lane for now.`,
          ],
          tone: "neutral",
        };
      }

      const queueSpinner = ora("Queueing stack pull requests...").start();
      const result: FocusStackQueueResult = {
        queued: [],
        reprioritized: [],
        removed: [],
        retried: [],
        skipped: plan
          .filter((item) => item.action !== "queue")
          .map((item) => ({
            prNumber: item.prNumber,
            reason:
              item.action === "already-queued"
                ? `already queued at position ${item.existingQueuePosition ?? "?"}`
                : item.reason || "not queueable",
          })),
        failed: [],
      };

      for (const item of queueable) {
        try {
          const response = await postWithAuth<{
            data: { entry?: { position?: number } };
          }>(`/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/queue`, {
            pullRequestId: item.prId,
            priority: item.priority,
            mergeMethod,
          });

          result.queued.push({
            prNumber: item.prNumber,
            priority: item.priority || 0,
            position: response.data.entry?.position,
          });
        } catch (error) {
          result.failed.push({
            prNumber: item.prNumber,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
      queueSpinner.stop();

      return {
        title:
          result.failed.length > 0
            ? "Stack queue completed with issues"
            : "Stack queued for merge lane",
        lines: [
          `Queued ${result.queued.length} PRs with ${mergeMethod} merge strategy.`,
          `Skipped ${result.skipped.length} PRs and failed ${result.failed.length}.`,
          ...result.queued
            .slice(0, 4)
            .map(
              (item) =>
                `Queued #${item.prNumber} at priority ${item.priority}${typeof item.position === "number" ? ` • position ${item.position}` : ""}`,
            ),
          ...result.failed
            .slice(0, 2)
            .map((item) => `Failed #${item.prNumber}: ${item.reason}`),
        ],
        tone: result.failed.length > 0 ? "warning" : "success",
      };
    }

    if (action === "reprioritize") {
      const { basePriority } = await inquirer.prompt<{ basePriority: string }>([
        {
          type: "input",
          name: "basePriority",
          message: "New base priority for the first queued stack PR",
          default: String(getDefaultStackQueuePriority(queuedStackItems)),
          validate: (value) => {
            if (!/^-?\d+$/.test(value.trim())) {
              return "Priority must be a whole number";
            }

            const parsed = Number(value.trim());
            if (parsed < -100 || parsed > 100) {
              return "Priority must stay between -100 and 100";
            }

            return true;
          },
        },
      ]);

      const queuedByNumber = new Map(
        queuedStackItems.map(
          (item) => [item.pullRequest.number, item] as const,
        ),
      );
      const reprioritizePlan = snapshot.activeStack.stack.entries
        .map((entry) => ({
          entry,
          queueItem: queuedByNumber.get(entry.pullRequest.number),
        }))
        .filter(
          (
            item,
          ): item is {
            entry: FocusStackApiItem["entries"][number];
            queueItem: FocusQueueItem;
          } => Boolean(item.queueItem),
        )
        .map((item, index, list) => ({
          queueItem: item.queueItem,
          prNumber: item.entry.pullRequest.number,
          priority: Math.max(
            -100,
            Math.min(100, Number(basePriority) + (list.length - index - 1)),
          ),
        }));

      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
        {
          type: "confirm",
          name: "confirm",
          message: `Reprioritize ${reprioritizePlan.length} queued stack PRs?`,
          default: false,
        },
      ]);

      if (!confirm) {
        return {
          title: "Stack reprioritization cancelled",
          lines: [
            `Left queued entries for ${snapshot.activeStack.stack.name} unchanged.`,
          ],
          tone: "neutral",
        };
      }

      const reprioritizeSpinner = ora(
        "Reprioritizing queued stack pull requests...",
      ).start();
      const result: FocusStackQueueResult = {
        queued: [],
        reprioritized: [],
        removed: [],
        retried: [],
        skipped: [],
        failed: [],
      };

      for (const item of reprioritizePlan) {
        try {
          await patchWithAuth(
            `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/queue`,
            {
              action: "reprioritize",
              entryId: item.queueItem.id,
              priority: item.priority,
            },
          );
          result.reprioritized.push({
            prNumber: item.prNumber,
            priority: item.priority,
          });
        } catch (error) {
          result.failed.push({
            prNumber: item.prNumber,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
      reprioritizeSpinner.stop();

      return {
        title:
          result.failed.length > 0
            ? "Stack reprioritized with issues"
            : "Stack queue reprioritized",
        lines: [
          `Updated ${result.reprioritized.length} queued stack PRs.`,
          ...result.reprioritized
            .slice(0, 5)
            .map((item) => `PR #${item.prNumber} → priority ${item.priority}`),
          ...result.failed
            .slice(0, 2)
            .map((item) => `Failed #${item.prNumber}: ${item.reason}`),
        ],
        tone: result.failed.length > 0 ? "warning" : "success",
      };
    }

    if (action === "remove") {
      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
        {
          type: "confirm",
          name: "confirm",
          message: `Remove ${queuedStackItems.length} queued stack PRs from the merge lane?`,
          default: false,
        },
      ]);

      if (!confirm) {
        return {
          title: "Stack queue removal cancelled",
          lines: [
            `Left queued entries for ${snapshot.activeStack.stack.name} in the merge lane.`,
          ],
          tone: "neutral",
        };
      }

      const removeSpinner = ora(
        "Removing queued stack pull requests...",
      ).start();
      const result: FocusStackQueueResult = {
        queued: [],
        reprioritized: [],
        removed: [],
        retried: [],
        skipped: [],
        failed: [],
      };

      for (const item of queuedStackItems) {
        try {
          await deleteWithAuth(
            `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/queue?entryId=${encodeURIComponent(item.id)}`,
          );
          result.removed.push(item.pullRequest.number);
        } catch (error) {
          result.failed.push({
            prNumber: item.pullRequest.number,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
      removeSpinner.stop();

      return {
        title:
          result.failed.length > 0
            ? "Stack queue removal completed with issues"
            : "Stack queue entries removed",
        lines: [
          `Removed ${result.removed.length} queued stack PRs from the merge lane.`,
          ...result.removed
            .slice(0, 5)
            .map((prNumber) => `Removed PR #${prNumber}`),
          ...result.failed
            .slice(0, 2)
            .map((item) => `Failed #${item.prNumber}: ${item.reason}`),
        ],
        tone: result.failed.length > 0 ? "warning" : "success",
      };
    }

    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: `Retry ${failedStackItems.length} failed stack queue entries?`,
        default: false,
      },
    ]);

    if (!confirm) {
      return {
        title: "Stack queue retry cancelled",
        lines: [
          `Left failed queue entries for ${snapshot.activeStack.stack.name} unchanged.`,
        ],
        tone: "neutral",
      };
    }

    const retrySpinner = ora("Retrying failed stack queue entries...").start();
    const result: FocusStackQueueResult = {
      queued: [],
      reprioritized: [],
      removed: [],
      retried: [],
      skipped: [],
      failed: [],
    };

    for (const item of failedStackItems) {
      try {
        await patchWithAuth(
          `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/queue`,
          {
            action: "retry",
            entryId: item.id,
          },
        );
        result.retried.push(item.pullRequest.number);
      } catch (error) {
        result.failed.push({
          prNumber: item.pullRequest.number,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    retrySpinner.stop();

    return {
      title:
        result.failed.length > 0
          ? "Stack queue retry completed with issues"
          : "Failed stack queue entries retried",
      lines: [
        `Retried ${result.retried.length} failed stack queue entries.`,
        ...result.retried
          .slice(0, 5)
          .map((prNumber) => `Retried PR #${prNumber}`),
        ...result.failed
          .slice(0, 2)
          .map((item) => `Failed #${item.prNumber}: ${item.reason}`),
      ],
      tone: result.failed.length > 0 ? "warning" : "success",
    };
  } catch (error) {
    spinner.fail("Failed to load stack queue state.");
    return {
      title: "Stack queue action failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runSyncShortcut(): Promise<FocusNotice> {
  const spinner = ora("Syncing tracked stack branches...").start();
  try {
    const result = await syncTrackedStack(git);
    if (result.syncedCount === 0) {
      spinner.info("No tracked stack branches to sync.");
      return {
        title: "Stack already current",
        lines: ["No tracked stack branches required rebasing."],
        tone: "neutral",
      };
    }

    spinner.succeed(`Synced ${result.syncedCount} tracked stack branches.`);
    return {
      title: "Stack synced",
      lines: [
        `Rebased ${result.syncedCount} tracked stack branches and restored ${result.currentBranch}.`,
        ...result.syncedBranches.map((branch) => `Rebased ${branch}.`),
        `Run 'och stack submit' when you are ready to push the updated branch tips.`,
      ],
      tone: "success",
    };
  } catch (error) {
    spinner.fail("Failed to sync tracked stack branches.");
    return {
      title: "Stack sync failed",
      lines: [
        error instanceof Error ? error.message : "Unknown error",
        "Resolve any rebase conflicts, then continue with 'git rebase --continue'.",
      ],
      tone: "danger",
    };
  }
}

async function runApproveShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  const targetPr = await promptForPullRequest(
    snapshot,
    "Choose a pull request to approve",
  );

  const { body } = await inquirer.prompt<{ body: string }>([
    {
      type: "input",
      name: "body",
      message: "Approval comment (optional)",
      default:
        targetPr.number === snapshot.currentPr?.number
          ? "Looks good from the current branch focus lane."
          : "Looks good to me.",
    },
  ]);

  const spinner = ora(`Approving PR #${targetPr.number}...`).start();
  try {
    await submitReviewEvent(snapshot, targetPr.number, "approve", body);
    spinner.succeed(`Approved PR #${targetPr.number}.`);
    return {
      title: "Review approved",
      lines: [
        `Approved PR #${targetPr.number} from the terminal focus cockpit.`,
        body.trim()
          ? `Comment: ${body.trim()}`
          : "No approval comment was attached.",
      ],
      tone: "success",
    };
  } catch (error) {
    spinner.fail("Failed to approve pull request.");
    return {
      title: "Approval failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runRequestChangesShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  const targetPr = await promptForPullRequest(
    snapshot,
    "Choose a pull request to request changes on",
  );

  const { body } = await inquirer.prompt<{ body: string }>([
    {
      type: "input",
      name: "body",
      message: "Change request comment",
      default:
        targetPr.number === snapshot.currentPr?.number
          ? "Please address the current branch feedback before merging."
          : "Please address the requested changes before merging.",
      validate: (value) =>
        value.trim().length > 0 ||
        "A comment is required when requesting changes",
    },
  ]);

  const spinner = ora(
    `Requesting changes on PR #${targetPr.number}...`,
  ).start();
  try {
    await submitReviewEvent(snapshot, targetPr.number, "request_changes", body);
    spinner.succeed(`Requested changes on PR #${targetPr.number}.`);
    return {
      title: "Changes requested",
      lines: [
        `Requested changes on PR #${targetPr.number} from the terminal focus cockpit.`,
        `Comment: ${body.trim()}`,
      ],
      tone: "warning",
    };
  } catch (error) {
    spinner.fail("Failed to request changes.");
    return {
      title: "Request changes failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runCommentShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  const targetPr = await promptForPullRequest(
    snapshot,
    "Choose a pull request to comment on",
  );

  const { body } = await inquirer.prompt<{ body: string }>([
    {
      type: "input",
      name: "body",
      message: "Review comment",
      default:
        targetPr.number === snapshot.currentPr?.number
          ? "Leaving a quick note from the terminal focus cockpit."
          : "Quick reviewer note.",
      validate: (value) => value.trim().length > 0 || "Comment cannot be empty",
    },
  ]);

  const spinner = ora(`Commenting on PR #${targetPr.number}...`).start();
  try {
    await submitReviewEvent(snapshot, targetPr.number, "comment", body);
    spinner.succeed(`Added a comment to PR #${targetPr.number}.`);
    return {
      title: "Comment added",
      lines: [
        `Posted a review comment on PR #${targetPr.number}.`,
        `Comment: ${body.trim()}`,
      ],
      tone: "info",
    };
  } catch (error) {
    spinner.fail("Failed to add comment.");
    return {
      title: "Comment failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runAiReviewShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  const targetPr = await promptForPullRequest(
    snapshot,
    "Choose a pull request to send through AI review",
  );

  const { waitForResult } = await inquirer.prompt<{ waitForResult: boolean }>([
    {
      type: "confirm",
      name: "waitForResult",
      message: "Wait here for the AI review to finish?",
      default: false,
    },
  ]);

  const spinner = ora(
    `Triggering AI review for PR #${targetPr.number}...`,
  ).start();
  try {
    const result = await postWithAuth<{ data: { status: string } }>(
      `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/pulls/${targetPr.number}/ai-review`,
      {},
    );

    if (!waitForResult) {
      spinner.succeed(`AI review triggered for PR #${targetPr.number}.`);
      return {
        title: "AI review started",
        lines: [
          `Triggered AI review for PR #${targetPr.number}.`,
          `Use focus refresh or 'och review status ${targetPr.number}' to monitor progress.`,
        ],
        tone: "success",
      };
    }

    spinner.text = `Waiting for AI review on PR #${targetPr.number}...`;
    let reviewStatus = result.data.status;

    while (reviewStatus === "pending" || reviewStatus === "running") {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const statusResult = await getWithAuth<{
        data: {
          status: string;
          overallSeverity?: string | null;
          suggestions?: unknown[];
        };
      }>(
        `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/pulls/${targetPr.number}/ai-review`,
      );
      reviewStatus = statusResult.data.status;

      if (reviewStatus !== "pending" && reviewStatus !== "running") {
        spinner.succeed(
          `AI review ${reviewStatus} for PR #${targetPr.number}.`,
        );
        return {
          title:
            reviewStatus === "completed"
              ? "AI review completed"
              : "AI review finished",
          lines: [
            `PR #${targetPr.number} AI review ended with status ${reviewStatus}.`,
            statusResult.data.overallSeverity
              ? `Overall severity ${statusResult.data.overallSeverity}.`
              : `Suggestions ${statusResult.data.suggestions?.length || 0}.`,
          ],
          tone: reviewStatus === "completed" ? "success" : "warning",
        };
      }
    }

    spinner.succeed(`AI review ${reviewStatus} for PR #${targetPr.number}.`);
    return {
      title: "AI review updated",
      lines: [`PR #${targetPr.number} AI review is ${reviewStatus}.`],
      tone: "info",
    };
  } catch (error) {
    spinner.fail("Failed to trigger AI review.");
    return {
      title: "AI review failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runMergeShortcut(snapshot: FocusSnapshot): Promise<FocusNotice> {
  const targetPr = await promptForPullRequest(
    snapshot,
    "Choose a pull request to merge",
  );

  const { mergeMethod, deleteBranch, confirm } = await inquirer.prompt<{
    mergeMethod: "merge" | "squash" | "rebase";
    deleteBranch: boolean;
    confirm: boolean;
  }>([
    {
      type: "list",
      name: "mergeMethod",
      message: "Merge method",
      default: targetPr.queueStatus === "queued" ? "merge" : "squash",
      choices: ["merge", "squash", "rebase"],
    },
    {
      type: "confirm",
      name: "deleteBranch",
      message: `Delete branch ${targetPr.sourceBranch} after merge?`,
      default: true,
    },
    {
      type: "confirm",
      name: "confirm",
      message: `Merge PR #${targetPr.number} now?`,
      default: false,
    },
  ]);

  if (!confirm) {
    return {
      title: "Merge cancelled",
      lines: [`Left PR #${targetPr.number} open.`],
      tone: "neutral",
    };
  }

  const spinner = ora(`Merging PR #${targetPr.number}...`).start();
  try {
    await postWithAuth(
      `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/pulls/${targetPr.number}/merge`,
      {
        method: mergeMethod,
        deleteBranch,
      },
    );
    spinner.succeed(`Merged PR #${targetPr.number}.`);
    return {
      title: "Pull request merged",
      lines: [
        `Merged PR #${targetPr.number} with ${mergeMethod} strategy.`,
        deleteBranch
          ? `Deleted ${targetPr.sourceBranch} after merge.`
          : `Kept ${targetPr.sourceBranch} after merge.`,
      ],
      tone: "success",
    };
  } catch (error) {
    spinner.fail("Failed to merge pull request.");
    return {
      title: "Merge failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runCloseShortcut(snapshot: FocusSnapshot): Promise<FocusNotice> {
  const targetPr = await promptForPullRequest(
    snapshot,
    "Choose a pull request to close",
  );

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: "confirm",
      name: "confirm",
      message: `Close PR #${targetPr.number}?`,
      default: false,
    },
  ]);

  if (!confirm) {
    return {
      title: "Close cancelled",
      lines: [`Left PR #${targetPr.number} open.`],
      tone: "neutral",
    };
  }

  const spinner = ora(`Closing PR #${targetPr.number}...`).start();
  try {
    await patchWithAuth(
      `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/pulls/${targetPr.number}`,
      { state: "closed" },
    );
    spinner.succeed(`Closed PR #${targetPr.number}.`);
    return {
      title: "Pull request closed",
      lines: [`Closed PR #${targetPr.number} from the terminal focus cockpit.`],
      tone: "success",
    };
  } catch (error) {
    spinner.fail("Failed to close pull request.");
    return {
      title: "Close failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runViewDiffShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  const targetPr = await promptForPullRequest(
    snapshot,
    "Choose a pull request diff to inspect",
  );

  const spinner = ora(`Fetching diff for PR #${targetPr.number}...`).start();
  try {
    const result = await getWithAuth<{
      data: {
        diff: string;
        sourceBranch?: string;
        targetBranch?: string;
      };
    }>(
      `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/pulls/${targetPr.number}/diff`,
    );

    const { mode } = await inquirer.prompt<{
      mode: "preview" | "pager" | "copy";
    }>([
      {
        type: "list",
        name: "mode",
        message: `How should the diff for PR #${targetPr.number} be shown?`,
        default: process.stdout.isTTY ? "pager" : "preview",
        choices: [
          { name: "Open full diff in pager", value: "pager" },
          { name: "Show a preview in the focus recap", value: "preview" },
          { name: "Copy full diff to clipboard", value: "copy" },
        ],
      },
    ]);

    const renderedDiff = formatDiffForPager(
      targetPr,
      result.data.diff,
      result.data.sourceBranch,
      result.data.targetBranch,
    );

    if (mode === "pager") {
      spinner.stop();
      await openContentInPager(renderedDiff);
      return {
        title: `Paged diff for PR #${targetPr.number}`,
        lines: [
          `Opened the full diff for PR #${targetPr.number} in your terminal pager.`,
          `Branches ${result.data.sourceBranch || targetPr.sourceBranch} → ${result.data.targetBranch || targetPr.targetBranch}`,
        ],
        tone: "success",
      };
    }

    if (mode === "copy") {
      spinner.stop();
      try {
        await writeClipboard(result.data.diff);
        return {
          title: `Copied diff for PR #${targetPr.number}`,
          lines: [
            `Copied the full diff for PR #${targetPr.number} to the clipboard.`,
            `Branches ${result.data.sourceBranch || targetPr.sourceBranch} → ${result.data.targetBranch || targetPr.targetBranch}`,
          ],
          tone: "success",
        };
      } catch (error) {
        const diffLines = result.data.diff.split("\n");
        const previewLimit = 24;
        const previewLines = diffLines.slice(0, previewLimit);
        if (diffLines.length > previewLimit) {
          previewLines.push(
            `… ${diffLines.length - previewLimit} more lines omitted.`,
          );
        }

        return {
          title: "Diff copy failed",
          lines: [
            error instanceof Error ? error.message : "Unknown error",
            "Showing a preview in the focus recap instead.",
            `Branches ${result.data.sourceBranch || targetPr.sourceBranch} → ${result.data.targetBranch || targetPr.targetBranch}`,
            ...previewLines,
          ],
          tone: "warning",
        };
      }
    }

    spinner.succeed(`Loaded diff for PR #${targetPr.number}.`);

    const diffLines = result.data.diff.split("\n");
    const previewLimit = 24;
    const previewLines = diffLines.slice(0, previewLimit);
    if (diffLines.length > previewLimit) {
      previewLines.push(
        `… ${diffLines.length - previewLimit} more lines omitted.`,
      );
    }

    return {
      title: `Diff preview for PR #${targetPr.number}`,
      lines: [
        `Branches ${result.data.sourceBranch || targetPr.sourceBranch} → ${result.data.targetBranch || targetPr.targetBranch}`,
        ...previewLines,
      ],
      tone: "info",
    };
  } catch (error) {
    spinner.fail("Failed to fetch diff.");
    return {
      title: "Diff fetch failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function loadRoutingCandidates(
  snapshot: FocusSnapshot,
): Promise<FocusRoutingCandidate[]> {
  return loadRoutingCandidatesForRepo(snapshot.repoOwner, snapshot.repoName);
}

async function runAssignReviewerShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  const targetPr = await promptForPullRequest(
    snapshot,
    "Choose a pull request to assign a reviewer",
  );

  const spinner = ora("Loading reviewer candidates...").start();
  try {
    const candidates = await loadRoutingCandidates(snapshot);
    spinner.stop();

    if (candidates.length === 0) {
      return {
        title: "No reviewer candidates available",
        lines: [
          `No repository owners or collaborators are available to route onto PR #${targetPr.number}.`,
        ],
        tone: "warning",
      };
    }

    const { reviewerId, reviewerMode } = await inquirer.prompt<{
      reviewerId: string;
      reviewerMode: "requested" | "required";
    }>([
      {
        type: "list",
        name: "reviewerId",
        message: `Reviewer for PR #${targetPr.number}`,
        pageSize: 12,
        choices: candidates.map((candidate) => {
          const isRecommended =
            snapshot.activeStackApprovals?.recommendedReviewers.includes(
              candidate.username,
            ) ?? false;
          const loadTone =
            candidate.pendingReviewCount <= 2
              ? "success"
              : candidate.pendingReviewCount <= 5
                ? "warning"
                : "danger";

          return {
            name: [
              formatBadge(candidate.role, "muted"),
              isRecommended ? formatBadge("recommended", "accent") : null,
              candidate.displayName || `@${candidate.username}`,
              chalk.hex("#94a3b8")(`@${candidate.username}`),
              `${formatBadge(String(candidate.pendingReviewCount), loadTone)} pending`,
            ]
              .filter(Boolean)
              .join(" "),
            value: candidate.id,
            short: candidate.username,
          };
        }),
      },
      {
        type: "list",
        name: "reviewerMode",
        message: "Reviewer type",
        default: "requested",
        choices: [
          { name: "Requested reviewer", value: "requested" },
          { name: "Required reviewer", value: "required" },
        ],
      },
    ]);

    const reviewer = candidates.find(
      (candidate) => candidate.id === reviewerId,
    );
    if (!reviewer) {
      throw new Error("Selected reviewer is no longer available.");
    }

    spinner.start(
      `Assigning @${reviewer.username} to PR #${targetPr.number}...`,
    );
    const result = await postWithAuth<{
      data: {
        summary?: {
          reviewersAdded?: number;
          reviewersSkipped?: number;
          reviewerAuthorConflicts?: number;
        };
      };
    }>(
      `/api/repos/${snapshot.repoOwner}/${snapshot.repoName}/pulls/reviewer-routing`,
      {
        prIds: [targetPr.id],
        reviewerIds: [reviewer.id],
        reviewerMode,
      },
    );
    spinner.succeed(
      `Assigned @${reviewer.username} to PR #${targetPr.number}.`,
    );

    const summary = result.data.summary;
    const modeLabel = reviewerMode === "required" ? "required" : "requested";
    const isRecommended =
      snapshot.activeStackApprovals?.recommendedReviewers.includes(
        reviewer.username,
      ) ?? false;
    return {
      title: "Reviewer assigned",
      lines: [
        `Added @${reviewer.username} as a ${modeLabel} reviewer on PR #${targetPr.number}.`,
        isRecommended
          ? `@${reviewer.username} was one of the stack-recommended reviewers.`
          : `@${reviewer.username} currently has ${reviewer.pendingReviewCount} pending reviews.`,
        `Summary: added ${summary?.reviewersAdded || 0}, skipped ${summary?.reviewersSkipped || 0}, author conflicts ${summary?.reviewerAuthorConflicts || 0}.`,
      ],
      tone: "success",
    };
  } catch (error) {
    spinner.fail("Failed to assign reviewer.");
    return {
      title: "Reviewer assignment failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runCheckoutShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  const targetPr = await promptForPullRequest(
    snapshot,
    "Choose a pull request branch to check out",
  );

  const spinner = ora(`Checking out ${targetPr.sourceBranch}...`).start();
  try {
    await git.fetch(["origin", targetPr.sourceBranch]);
    await git.checkout(targetPr.sourceBranch);
    spinner.succeed(`Checked out ${targetPr.sourceBranch}.`);
    return {
      title: "Branch checked out",
      lines: [
        `Checked out PR #${targetPr.number} branch ${targetPr.sourceBranch}.`,
      ],
      tone: "success",
    };
  } catch (error) {
    spinner.fail("Failed to check out branch.");
    return {
      title: "Checkout failed",
      lines: [error instanceof Error ? error.message : "Unknown error"],
      tone: "danger",
    };
  }
}

async function runCopyShortcut(snapshot: FocusSnapshot): Promise<FocusNotice> {
  const targetPr = await promptForPullRequest(
    snapshot,
    "Choose a pull request to copy",
  );

  const { copyMode } = await inquirer.prompt<{
    copyMode: "url" | "number" | "both";
  }>([
    {
      type: "list",
      name: "copyMode",
      message: "What should be copied?",
      default: "url",
      choices: [
        { name: "PR URL", value: "url" },
        { name: "PR number", value: "number" },
        { name: "PR URL and number", value: "both" },
      ],
    },
  ]);

  const url = buildPrUrl(snapshot, targetPr.number);
  const textToCopy =
    copyMode === "url"
      ? url
      : copyMode === "number"
        ? `#${targetPr.number}`
        : `#${targetPr.number}\n${url}`;

  try {
    await writeClipboard(textToCopy);
    return {
      title: "Copied pull request reference",
      lines: [
        copyMode === "url"
          ? `Copied PR #${targetPr.number} URL to the clipboard.`
          : copyMode === "number"
            ? `Copied PR #${targetPr.number} number to the clipboard.`
            : `Copied PR #${targetPr.number} number and URL to the clipboard.`,
        textToCopy,
      ],
      tone: "success",
    };
  } catch (error) {
    return {
      title: "Clipboard copy failed",
      lines: [
        error instanceof Error ? error.message : "Unknown error",
        textToCopy,
      ],
      tone: "warning",
    };
  }
}

function openUrlInBrowser(url: string) {
  if (process.platform === "darwin") {
    const child = spawn("open", [url], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return;
  }

  if (process.platform === "win32") {
    const child = spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return;
  }

  const child = spawn("xdg-open", [url], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function runOpenCurrentPrShortcut(
  snapshot: FocusSnapshot,
): Promise<FocusNotice> {
  if (!snapshot.currentPr) {
    return {
      title: "No current pull request",
      lines: ["The current branch is not linked to an open pull request."],
      tone: "neutral",
    };
  }

  const url = buildPrUrl(snapshot, snapshot.currentPr.number);

  try {
    openUrlInBrowser(url);
    return {
      title: "Opened current pull request",
      lines: [`Opened PR #${snapshot.currentPr.number} in your browser.`, url],
      tone: "success",
    };
  } catch (error) {
    return {
      title: "Open in browser failed",
      lines: [error instanceof Error ? error.message : "Unknown error", url],
      tone: "danger",
    };
  }
}

async function promptForPullRequest(
  snapshot: FocusSnapshot,
  message: string,
): Promise<FocusPullRequest> {
  const currentPrNumber = snapshot.currentPr?.number;
  const choices = snapshot.openPullRequests.map((pr) => {
    const stackEntry = getStackEntryForPr(snapshot, pr.number);
    const queueState = snapshot.queueItems.find(
      (item) => item.pullRequest.number === pr.number,
    );
    const label = [
      formatBadge(`#${pr.number}`, "info"),
      pr.number === currentPrNumber ? formatBadge("current", "accent") : null,
      stackEntry
        ? formatBadge(`stack ${stackEntry.stackOrder}`, "accent")
        : null,
      queueState
        ? formatBadge(queueState.status.replace(/_/g, " "), "warning")
        : null,
      truncateText(pr.title, 64),
      chalk.hex("#94a3b8")(
        `@${pr.author.username} • ${pr.reviewerCount ?? 0} reviewers • ${formatRelativeTime(pr.updatedAt)}`,
      ),
    ]
      .filter(Boolean)
      .join(" ");

    return {
      name: label,
      value: pr.number,
      short: `#${pr.number}`,
    };
  });

  const { prNumber } = await inquirer.prompt<{ prNumber: number }>([
    {
      type: "list",
      name: "prNumber",
      message,
      pageSize: 12,
      choices,
      default: currentPrNumber,
    },
  ]);

  const selected = snapshot.openPullRequests.find(
    (pr) => pr.number === prNumber,
  );
  if (!selected) {
    throw new Error(`Pull request #${prNumber} is no longer available.`);
  }

  return selected;
}

async function promptForQueueItem(
  snapshot: FocusSnapshot,
  message: string,
  items = snapshot.queueItems,
): Promise<FocusQueueItem> {
  if (items.length === 0) {
    throw new Error("No queue entries are available for that action.");
  }

  const currentQueuePrNumber = snapshot.currentQueueItem?.pullRequest.number;
  const choices = items.map((item) => {
    const stackEntry = getStackEntryForPr(snapshot, item.pullRequest.number);
    const label = [
      formatBadge(`#${item.pullRequest.number}`, "info"),
      item.pullRequest.number === currentQueuePrNumber
        ? formatBadge("current", "accent")
        : null,
      stackEntry
        ? formatBadge(`stack ${stackEntry.stackOrder}`, "accent")
        : null,
      formatBadge(
        item.status.replace(/_/g, " "),
        getQueueStatusTone(item.status),
      ),
      truncateText(item.pullRequest.title, 56),
      chalk.hex("#94a3b8")(
        `priority ${item.priority} • pos ${item.position} • @${item.pullRequest.author.username}`,
      ),
    ]
      .filter(Boolean)
      .join(" ");

    return {
      name: label,
      value: item.id,
      short: `#${item.pullRequest.number}`,
    };
  });

  const { queueItemId } = await inquirer.prompt<{ queueItemId: string }>([
    {
      type: "list",
      name: "queueItemId",
      message,
      pageSize: 12,
      choices,
      default:
        items.find((item) => item.id === snapshot.currentQueueItem?.id)?.id ||
        items[0]?.id,
    },
  ]);

  const selected = items.find((item) => item.id === queueItemId);
  if (!selected) {
    throw new Error("The queued pull request is no longer available.");
  }

  return selected;
}

export default focusCommand;
