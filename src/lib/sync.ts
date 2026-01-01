/**
 * Bidirectional Sync Library
 * Sync local Git state with remote stacks and vice versa
 */

import { eq, and, desc } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { simpleGit, SimpleGit } from "simple-git";
import { getStack, getStackForPr, addToStack, createStack } from "./stacks";
import { generateId } from "./utils";

// Types
export interface SyncStatus {
    localBranch: string;
    remoteBranch: string | null;
    ahead: number;
    behind: number;
    hasUnpushedChanges: boolean;
    hasRemoteChanges: boolean;
    lastSyncedAt: string | null;
}

export interface StackSyncResult {
    success: boolean;
    message: string;
    syncedBranches: string[];
    conflicts?: string[];
    ciStatuses?: Record<string, string>;
}

export interface RemoteCIStatus {
    prNumber: number;
    status: "pending" | "running" | "success" | "failure";
    conclusion?: string;
    checkRuns: Array<{
        name: string;
        status: string;
        conclusion?: string;
    }>;
}

/**
 * Get sync status for a branch
 */
export async function getBranchSyncStatus(
    repoPath: string,
    branchName: string
): Promise<SyncStatus> {
    const git: SimpleGit = simpleGit(repoPath);

    try {
        // Fetch latest from remote
        await git.fetch();

        // Get current branch info
        const status = await git.status();
        const currentBranch = status.current;

        // Check if branch exists on remote
        const remoteBranches = await git.branch(["-r"]);
        const remoteBranch = remoteBranches.all.find(
            b => b === `origin/${branchName}` || b.endsWith(`/${branchName}`)
        );

        if (!remoteBranch) {
            return {
                localBranch: branchName,
                remoteBranch: null,
                ahead: 0,
                behind: 0,
                hasUnpushedChanges: true,
                hasRemoteChanges: false,
                lastSyncedAt: null,
            };
        }

        // Get ahead/behind counts
        const log = await git.raw([
            "rev-list",
            "--left-right",
            "--count",
            `${branchName}...origin/${branchName}`,
        ]);

        const [ahead, behind] = log.trim().split("\t").map(Number);

        return {
            localBranch: branchName,
            remoteBranch: `origin/${branchName}`,
            ahead: ahead || 0,
            behind: behind || 0,
            hasUnpushedChanges: (ahead || 0) > 0,
            hasRemoteChanges: (behind || 0) > 0,
            lastSyncedAt: new Date().toISOString(),
        };
    } catch (error) {
        console.error("Error getting sync status:", error);
        return {
            localBranch: branchName,
            remoteBranch: null,
            ahead: 0,
            behind: 0,
            hasUnpushedChanges: false,
            hasRemoteChanges: false,
            lastSyncedAt: null,
        };
    }
}

/**
 * Sync local stack to remote (push all branches)
 */
export async function pushStackToRemote(
    repoPath: string,
    stackId: string,
    force: boolean = false
): Promise<StackSyncResult> {
    const git: SimpleGit = simpleGit(repoPath);
    const syncedBranches: string[] = [];
    const conflicts: string[] = [];

    try {
        const stackInfo = await getStack(stackId);
        if (!stackInfo) {
            return { success: false, message: "Stack not found", syncedBranches };
        }

        // Sort entries by stack order
        const entries = [...stackInfo.entries].sort((a, b) => a.entry.stackOrder - b.entry.stackOrder);

        // Push each branch in order
        for (const entry of entries) {
            const branchName = entry.pr.headBranch;

            try {
                // Check current branch
                const status = await git.status();
                if (status.current !== branchName) {
                    await git.checkout(branchName);
                }

                // Push to remote
                const pushArgs = ["-u", "origin", branchName];
                if (force) {
                    pushArgs.unshift("--force-with-lease");
                }

                await git.push(pushArgs);
                syncedBranches.push(branchName);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                if (errorMessage.includes("rejected") || errorMessage.includes("non-fast-forward")) {
                    conflicts.push(branchName);
                } else {
                    throw error;
                }
            }
        }

        if (conflicts.length > 0) {
            return {
                success: false,
                message: `Some branches have conflicts: ${conflicts.join(", ")}`,
                syncedBranches,
                conflicts,
            };
        }

        return {
            success: true,
            message: `Pushed ${syncedBranches.length} branches to remote`,
            syncedBranches,
        };
    } catch (error) {
        console.error("Error pushing stack:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Unknown error",
            syncedBranches,
            conflicts,
        };
    }
}

/**
 * Pull remote changes into local stack
 */
export async function pullStackFromRemote(
    repoPath: string,
    stackId: string,
    rebase: boolean = true
): Promise<StackSyncResult> {
    const git: SimpleGit = simpleGit(repoPath);
    const syncedBranches: string[] = [];
    const conflicts: string[] = [];

    try {
        // Fetch latest
        await git.fetch();

        const stackInfo = await getStack(stackId);
        if (!stackInfo) {
            return { success: false, message: "Stack not found", syncedBranches };
        }

        // Sort entries by stack order (base first)
        const entries = [...stackInfo.entries].sort((a, b) => a.entry.stackOrder - b.entry.stackOrder);

        // Pull each branch
        for (const entry of entries) {
            const branchName = entry.pr.headBranch;

            try {
                await git.checkout(branchName);

                if (rebase) {
                    // Rebase on remote
                    await git.pull(["--rebase", "origin", branchName]);
                } else {
                    // Merge remote
                    await git.pull(["origin", branchName]);
                }

                syncedBranches.push(branchName);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "";
                if (errorMessage.includes("CONFLICT") || errorMessage.includes("conflict")) {
                    conflicts.push(branchName);
                    // Abort the rebase/merge
                    await git.raw(["rebase", "--abort"]).catch(() => { });
                    await git.raw(["merge", "--abort"]).catch(() => { });
                } else {
                    throw error;
                }
            }
        }

        if (conflicts.length > 0) {
            return {
                success: false,
                message: `Conflicts in: ${conflicts.join(", ")}`,
                syncedBranches,
                conflicts,
            };
        }

        return {
            success: true,
            message: `Pulled ${syncedBranches.length} branches from remote`,
            syncedBranches,
        };
    } catch (error) {
        console.error("Error pulling stack:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Unknown error",
            syncedBranches,
            conflicts,
        };
    }
}

/**
 * Sync CI status from remote for a PR
 */
export async function syncCIStatus(
    repositoryId: string,
    pullRequestId: string
): Promise<RemoteCIStatus | null> {
    const db = getDatabase();

    // Get PR
    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, pullRequestId),
    });

    if (!pr) return null;

    // Get check runs from database (these would be updated by webhook handlers)
    const checks = await db.query.pullRequestChecks.findMany({
        where: eq(schema.pullRequestChecks.pullRequestId, pullRequestId),
        orderBy: [desc(schema.pullRequestChecks.createdAt)],
    });

    // Determine overall status
    let overallStatus: "pending" | "running" | "success" | "failure" = "pending";

    if (checks.length > 0) {
        const hasRunning = checks.some(c => c.status === "in_progress");
        const hasFailure = checks.some(c => c.conclusion === "failure" || c.conclusion === "cancelled");
        const allSuccess = checks.every(c => c.conclusion === "success");

        if (hasRunning) {
            overallStatus = "running";
        } else if (hasFailure) {
            overallStatus = "failure";
        } else if (allSuccess) {
            overallStatus = "success";
        }
    }

    return {
        prNumber: pr.number,
        status: overallStatus,
        checkRuns: checks.map(c => ({
            name: c.name,
            status: c.status,
            conclusion: c.conclusion || undefined,
        })),
    };
}

/**
 * Sync all CI statuses for a stack
 */
export async function syncStackCIStatuses(
    stackId: string
): Promise<Record<number, RemoteCIStatus>> {
    const stackInfo = await getStack(stackId);
    if (!stackInfo) return {};

    const statuses: Record<number, RemoteCIStatus> = {};

    for (const entry of stackInfo.entries) {
        const status = await syncCIStatus(
            stackInfo.stack.repositoryId,
            entry.pr.id
        );
        if (status) {
            statuses[entry.pr.number] = status;
        }
    }

    return statuses;
}

/**
 * Detect local branches that could form a stack
 */
export async function detectLocalStack(
    repoPath: string,
    baseBranch: string = "main"
): Promise<{
    branches: string[];
    suggestedOrder: string[];
}> {
    const git: SimpleGit = simpleGit(repoPath);

    try {
        // Get all local branches
        const branches = await git.branchLocal();

        // Filter branches that branch off from base
        const stackBranches: string[] = [];

        for (const branchName of branches.all) {
            if (branchName === baseBranch) continue;

            // Check if branch is based on baseBranch
            try {
                const mergeBase = await git.raw(["merge-base", baseBranch, branchName]);
                const baseHead = await git.revparse([baseBranch]);

                // If merge-base is close to base head, it's likely a feature branch
                stackBranches.push(branchName);
            } catch {
                // Ignore branches that can't be compared
            }
        }

        // Sort by commit date (oldest first for stack order)
        const branchDates: Array<{ branch: string; date: Date }> = [];

        for (const branch of stackBranches) {
            try {
                const log = await git.log(["-1", branch]);
                if (log.latest) {
                    branchDates.push({
                        branch,
                        date: new Date(log.latest.date),
                    });
                }
            } catch {
                branchDates.push({ branch, date: new Date() });
            }
        }

        branchDates.sort((a, b) => a.date.getTime() - b.date.getTime());

        return {
            branches: stackBranches,
            suggestedOrder: branchDates.map(b => b.branch),
        };
    } catch (error) {
        console.error("Error detecting stack:", error);
        return { branches: [], suggestedOrder: [] };
    }
}

/**
 * Create a stack from detected local branches
 */
export async function createStackFromBranches(
    repositoryId: string,
    baseBranch: string,
    branchNames: string[],
    createdById: string,
    stackName?: string
): Promise<{ stackId: string; prIds: string[] }> {
    const db = getDatabase();

    // Create the stack
    const stack = await createStack({
        repositoryId,
        baseBranch,
        name: stackName,
        createdById,
    });

    const prIds: string[] = [];

    // Find or create PRs for each branch
    for (let i = 0; i < branchNames.length; i++) {
        const branchName = branchNames[i];

        // Check if PR already exists for this branch
        let pr = await db.query.pullRequests.findFirst({
            where: and(
                eq(schema.pullRequests.repositoryId, repositoryId),
                eq(schema.pullRequests.headBranch, branchName),
                eq(schema.pullRequests.state, "open"),
            ),
        });

        if (pr) {
            // Add existing PR to stack
            await addToStack({
                stackId: stack.id,
                pullRequestId: pr.id,
                parentPrId: i > 0 ? prIds[i - 1] : undefined,
            });
            prIds.push(pr.id);
        }
        // Note: If no PR exists, user needs to create one first
    }

    return { stackId: stack.id, prIds };
}

/**
 * Get full sync status for a stack
 */
export async function getStackSyncStatus(
    repoPath: string,
    stackId: string
): Promise<{
    stack: Awaited<ReturnType<typeof getStack>>;
    branchStatuses: Record<string, SyncStatus>;
    ciStatuses: Record<number, RemoteCIStatus>;
    needsSync: boolean;
    hasConflicts: boolean;
}> {
    const stackInfo = await getStack(stackId);

    if (!stackInfo) {
        throw new Error("Stack not found");
    }

    const branchStatuses: Record<string, SyncStatus> = {};
    let needsSync = false;

    for (const entry of stackInfo.entries) {
        const status = await getBranchSyncStatus(repoPath, entry.pr.headBranch);
        branchStatuses[entry.pr.headBranch] = status;

        if (status.hasUnpushedChanges || status.hasRemoteChanges) {
            needsSync = true;
        }
    }

    const ciStatuses = await syncStackCIStatuses(stackId);

    const hasConflicts = Object.values(branchStatuses).some(
        s => s.hasUnpushedChanges && s.hasRemoteChanges
    );

    return {
        stack: stackInfo,
        branchStatuses,
        ciStatuses,
        needsSync,
        hasConflicts,
    };
}
