/**
 * Stack Rebase Library
 * Handle rebasing of stacked PRs
 */

import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getStack } from "./stacks";
import { logger } from "./logger";
import simpleGit from "simple-git";
import { resolveRepoPath } from "@/lib/git-storage";

export interface RebaseResult {
    success: boolean;
    rebased: { prId: string; prNumber: number; newHeadSha: string }[];
    failed: { prId: string; prNumber: number; reason: string }[];
    conflicts: { prId: string; prNumber: number; files: string[] }[];
}

/**
 * Rebase an entire stack onto its base branch
 */
export async function rebaseStack(stackId: string): Promise<RebaseResult> {
    const stack = await getStack(stackId);

    if (!stack) {
        return {
            success: false,
            rebased: [],
            failed: [{ prId: "", prNumber: 0, reason: "Stack not found" }],
            conflicts: [],
        };
    }

    const db = getDatabase();
    const result: RebaseResult = {
        success: true,
        rebased: [],
        failed: [],
        conflicts: [],
    };

    // Get repository path
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, stack.stack.repositoryId),
    });

    if (!repo) {
        return {
            success: false,
            rebased: [],
            failed: [{ prId: "", prNumber: 0, reason: "Repository not found" }],
            conflicts: [],
        };
    }

    const repoPath = await resolveRepoPath(repo.diskPath);
    const git = simpleGit(repoPath);

    // Rebase each PR in order
    let currentBase = stack.stack.baseBranch;

    for (const { entry, pr } of stack.entries) {
        try {
            // Checkout the PR branch
            await git.checkout(pr.headBranch);

            // Try to rebase onto current base
            try {
                await git.rebase([currentBase]);

                // Get new head SHA
                const newHead = await git.revparse(["HEAD"]);

                // Update PR head SHA in database
                // @ts-expect-error - Drizzle multi-db union type issue
                await db.update(schema.pullRequests)
                    .set({
                        headSha: newHead,
                        baseSha: await git.revparse([currentBase]),
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.pullRequests.id, pr.id));

                result.rebased.push({
                    prId: pr.id,
                    prNumber: pr.number,
                    newHeadSha: newHead,
                });

                // This branch becomes the base for the next PR
                currentBase = pr.headBranch;
            } catch (rebaseError) {
                // Rebase failed - likely conflicts
                await git.rebase(["--abort"]).catch(() => { });

                result.conflicts.push({
                    prId: pr.id,
                    prNumber: pr.number,
                    files: [], // Would need to parse git status for actual conflicts
                });
                result.success = false;

                // Can't continue with remaining PRs
                break;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            result.failed.push({
                prId: pr.id,
                prNumber: pr.number,
                reason: message,
            });
            result.success = false;
            break;
        }
    }

    // Return to default branch
    try {
        await git.checkout(stack.stack.baseBranch);
    } catch {
        // Ignore checkout errors
    }

    logger.info({
        stackId,
        rebased: result.rebased.length,
        conflicts: result.conflicts.length,
        failed: result.failed.length,
    }, "Stack rebase completed");

    return result;
}

/**
 * Auto-update a stack when its base branch changes
 */
export async function autoUpdateStack(stackId: string): Promise<RebaseResult> {
    // For now, auto-update is the same as rebase
    // Could be enhanced to use merge instead of rebase
    return rebaseStack(stackId);
}

/**
 * Check if a stack needs rebasing
 */
export async function stackNeedsRebase(stackId: string): Promise<{
    needsRebase: boolean;
    behindBy: number;
}> {
    const stack = await getStack(stackId);
    if (!stack || stack.entries.length === 0) {
        return { needsRebase: false, behindBy: 0 };
    }

    const db = getDatabase();
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, stack.stack.repositoryId),
    });

    if (!repo) {
        return { needsRebase: false, behindBy: 0 };
    }

    try {
        const repoPath = await resolveRepoPath(repo.diskPath);
        const git = simpleGit(repoPath);

        // Get the first PR in the stack
        const firstPr = stack.entries[0].pr;

        // Check how many commits behind
        const behindAhead = await git.raw([
            "rev-list",
            "--left-right",
            "--count",
            `${firstPr.headBranch}...${stack.stack.baseBranch}`,
        ]);

        const [behind] = behindAhead.trim().split(/\s+/).map(Number);

        return {
            needsRebase: behind > 0,
            behindBy: behind || 0,
        };
    } catch {
        return { needsRebase: false, behindBy: 0 };
    }
}
