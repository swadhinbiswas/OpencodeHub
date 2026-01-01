/**
 * Conflict Automation Library
 * Automated conflict detection, resolution, and stack rebasing
 */

import { eq, and } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { logger } from "@/lib/logger";
import { simpleGit, SimpleGit } from "simple-git";
import { getStack, updateStackStatus } from "./stacks";
import { notifyPrEvent, notifyUserDm } from "./slack-notifications";

export interface ConflictInfo {
    hasConflict: boolean;
    conflictingFiles: string[];
    baseSha: string;
    headSha: string;
    canAutoResolve: boolean;
}

export interface RebaseResult {
    success: boolean;
    message: string;
    newHeadSha?: string;
    conflictInfo?: ConflictInfo;
}

/**
 * Check if a PR has merge conflicts
 */
export async function checkForConflicts(
    repoPath: string,
    baseBranch: string,
    headBranch: string
): Promise<ConflictInfo> {
    const git: SimpleGit = simpleGit(repoPath);

    try {
        // Get current SHAs
        const baseSha = await git.revparse([baseBranch]);
        const headSha = await git.revparse([headBranch]);

        // Try to perform a merge-tree check (dry run)
        // This checks if the merge would have conflicts without actually merging
        const mergeBase = await git.raw(["merge-base", baseBranch, headBranch]);

        // Check if there are any unmerged files
        try {
            // Use git merge --no-commit --no-ff to test merge without committing
            await git.raw([
                "merge-tree",
                mergeBase.trim(),
                baseBranch,
                headBranch,
            ]);

            return {
                hasConflict: false,
                conflictingFiles: [],
                baseSha: baseSha.trim(),
                headSha: headSha.trim(),
                canAutoResolve: true,
            };
        } catch (error) {
            // Parse conflict information
            const errorMessage = error instanceof Error ? error.message : "";
            const conflictingFiles = parseConflictingFiles(errorMessage);

            return {
                hasConflict: true,
                conflictingFiles,
                baseSha: baseSha.trim(),
                headSha: headSha.trim(),
                canAutoResolve: false,
            };
        }
    } catch (error) {
        logger.error({ err: error }, "Error checking conflicts");
        return {
            hasConflict: false,
            conflictingFiles: [],
            baseSha: "",
            headSha: "",
            canAutoResolve: false,
        };
    }
}

/**
 * Parse conflicting files from git output
 */
function parseConflictingFiles(gitOutput: string): string[] {
    const files: string[] = [];
    const lines = gitOutput.split("\n");

    for (const line of lines) {
        // Look for "CONFLICT" markers or "Merge conflict in" messages
        if (line.includes("CONFLICT") || line.includes("Merge conflict in")) {
            const match = line.match(/(?:CONFLICT|Merge conflict in)\s+(?:\([^)]+\)\s+)?(?:in\s+)?([^\s:]+)/i);
            if (match && match[1]) {
                files.push(match[1]);
            }
        }
    }

    return [...new Set(files)]; // Remove duplicates
}

/**
 * Rebase a stack on the base branch
 */
export async function rebaseStack(
    repoPath: string,
    stackId: string,
    baseBranch: string = "main"
): Promise<RebaseResult> {
    const db = getDatabase();
    const git: SimpleGit = simpleGit(repoPath);

    try {
        const stackInfo = await getStack(stackId);
        if (!stackInfo) {
            return { success: false, message: "Stack not found" };
        }

        // Sort entries by stack order
        const entries = [...stackInfo.entries].sort((a, b) => a.entry.stackOrder - b.entry.stackOrder);

        // Rebase each branch in order
        for (const entry of entries) {
            const parentBranch = entry.entry.parentPrId
                ? stackInfo.entries.find(e => e.pr.id === entry.entry.parentPrId)?.pr.headBranch || baseBranch
                : baseBranch;

            // Check out the branch
            await git.checkout(entry.pr.headBranch);

            // Check for conflicts first
            const conflictCheck = await checkForConflicts(repoPath, parentBranch, entry.pr.headBranch);

            if (conflictCheck.hasConflict) {
                return {
                    success: false,
                    message: `Conflicts found when rebasing PR #${entry.pr.number} onto ${parentBranch}`,
                    conflictInfo: conflictCheck,
                };
            }

            // Perform the rebase
            try {
                await git.rebase([parentBranch]);
            } catch (error) {
                // Abort the rebase if it fails
                await git.raw(["rebase", "--abort"]).catch(() => { });

                return {
                    success: false,
                    message: `Failed to rebase PR #${entry.pr.number}: ${error instanceof Error ? error.message : "Unknown error"}`,
                };
            }

            // Get new head SHA and update PR
            const newHeadSha = await git.revparse(["HEAD"]);
            await db.update(schema.pullRequests)
                .set({
                    headSha: newHeadSha.trim(),
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(schema.pullRequests.id, entry.pr.id));
        }

        // Update stack status
        await updateStackStatus(stackId);

        return {
            success: true,
            message: `Successfully rebased stack with ${entries.length} PRs`,
        };
    } catch (error) {
        logger.error({ err: error }, "Error rebasing stack");
        return {
            success: false,
            message: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Auto-rebase a stack after a PR is merged
 */
export async function autoRebaseAfterMerge(
    repositoryId: string,
    mergedPrId: string
): Promise<void> {
    const db = getDatabase();

    // Check if the merged PR was part of a stack
    const stackEntry = await db.query.prStackEntries.findFirst({
        where: eq(schema.prStackEntries.pullRequestId, mergedPrId),
    });

    if (!stackEntry) return;

    // Get the stack
    const stackInfo = await getStack(stackEntry.stackId);
    if (!stackInfo) return;

    // Get repository path
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repositoryId),
    });

    if (!repo || !repo.diskPath) return;

    // Find PRs that need rebasing (those after the merged PR in the stack)
    const remainingPrs = stackInfo.entries.filter(
        e => e.entry.stackOrder > stackEntry.stackOrder && e.pr.state === "open"
    );

    if (remainingPrs.length === 0) {
        // Update stack status
        await updateStackStatus(stackEntry.stackId);
        return;
    }

    // Trigger rebase for remaining PRs
    logger.info({ count: remainingPrs.length, stackId: stackEntry.stackId }, "Auto-rebasing PRs after merge");

    // This would typically be queued to a background job
    // For now, just log and update status
    await updateStackStatus(stackEntry.stackId);
}

/**
 * Suggest conflict resolution strategies
 */
export function suggestResolutionStrategies(conflictInfo: ConflictInfo): {
    strategy: string;
    description: string;
    command?: string;
}[] {
    const strategies = [];

    if (conflictInfo.conflictingFiles.length === 0) {
        strategies.push({
            strategy: "rebase",
            description: "Simple rebase should resolve this",
            command: "git rebase main",
        });
    }

    if (conflictInfo.conflictingFiles.length <= 3) {
        strategies.push({
            strategy: "manual_resolve",
            description: "Manually resolve conflicts in the specific files",
            command: `git checkout main -- ${conflictInfo.conflictingFiles.join(" ")}`,
        });
    }

    strategies.push({
        strategy: "squash_rebase",
        description: "Squash commits and rebase to simplify conflict resolution",
        command: "git rebase -i main",
    });

    strategies.push({
        strategy: "recreate_branch",
        description: "Create a new branch from main and cherry-pick changes",
        command: "git cherry-pick <commits>",
    });

    return strategies;
}
