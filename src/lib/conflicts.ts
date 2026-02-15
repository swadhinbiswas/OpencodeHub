
import { getDatabase } from "../db";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { acquireRepo, releaseRepo } from "./git-storage";
import { simpleGit } from "simple-git";
import { logger } from "./logger";
import fs from "fs/promises";
import path from "path";

const db = getDatabase();

export interface ConflictFile {
    path: string;
    content: string; // The file content with <<<<<<< marks
}

export interface Resolution {
    path: string;
    content: string;
}

/**
 * Checks for conflicts by attempting a dry-run merge (no commit)
 * Returns a list of conflicted files with their content markings.
 */
export async function checkConflicts(repoId: string, queueItemId: string): Promise<ConflictFile[]> {
    // 1. Fetch Queue Item & PR Info
    const queueItem = await db.query.mergeQueueItems.findFirst({
        where: eq(schema.mergeQueueItems.id, queueItemId),
        with: {
            repository: { with: { owner: true } },
            pullRequest: true
        }
    });

    if (!queueItem) throw new Error("Queue item not found");

    const repoOwner = queueItem.repository.owner.username;
    const repoName = queueItem.repository.name;
    const { headBranch, baseBranch } = queueItem.pullRequest;

    // 2. Acquire Repo
    const repoPath = await acquireRepo(repoOwner, repoName);
    const git = simpleGit(repoPath);

    try {
        // 3. Prepare Branches
        await git.fetch();
        // Reset to base
        await git.checkout(baseBranch);
        await git.pull();

        // 4. Attempt Merge
        try {
            await git.merge([`origin/${headBranch}`, "--no-commit", "--no-ff"]);
            // If merge succeeds without error, there are no conflicts?
            // Actually simple-git throws on conflict usually.
            return [];
        } catch (e: any) {
            // Merge failed, likely conflicts
            const status = await git.status();
            const conflictedFiles = status.conflicted;

            if (conflictedFiles.length === 0) {
                // Failed for other reason?
                logger.error("Merge failed but no conflicts detected via status", e);
                return [];
            }

            const results: ConflictFile[] = [];

            for (const file of conflictedFiles) {
                const content = await fs.readFile(path.join(repoPath, file), "utf-8");
                results.push({
                    path: file,
                    content: content
                });
            }

            // Abort the merge to clean up
            await git.merge(["--abort"]).catch(() => { });
            await git.checkout(baseBranch); // Clean reset

            return results;
        }

    } finally {
        // Cleanup: Abort merge if pending
        try {
            await git.merge(["--abort"]);
        } catch { }
        await releaseRepo(repoOwner, repoName, false);
    }
}

/**
 * Applies resolutions and commits the merge.
 */
export async function resolveConflicts(repoId: string, queueItemId: string, resolutions: Resolution[]) {
    // 1. Fetch Queue Item & PR Info (Same as check)
    const queueItem = await db.query.mergeQueueItems.findFirst({
        where: eq(schema.mergeQueueItems.id, queueItemId),
        with: {
            repository: { with: { owner: true } },
            pullRequest: true
        }
    });

    if (!queueItem) throw new Error("Queue item not found");

    const repoOwner = queueItem.repository.owner.username;
    const repoName = queueItem.repository.name;
    const { headBranch, baseBranch } = queueItem.pullRequest;

    // 2. Acquire Repo
    const repoPath = await acquireRepo(repoOwner, repoName);
    const git = simpleGit(repoPath);

    try {
        // 3. Prepare Branches
        await git.fetch();
        await git.checkout(baseBranch);
        await git.pull();

        // 4. Reproduce Merge Conflict
        try {
            await git.merge([`origin/${headBranch}`, "--no-commit", "--no-ff"]);
        } catch (e) {
            // Expected to fail
        }

        // 5. Apply Resolutions
        for (const res of resolutions) {
            const absPath = path.join(repoPath, res.path);
            await fs.writeFile(absPath, res.content);
            await git.add(res.path);
        }

        // Verify no conflicts remain
        const status = await git.status();
        if (status.conflicted.length > 0) {
            throw new Error(`Not all conflicts resolved. Remaining: ${status.conflicted.join(", ")}`);
        }

        // 6. Commit
        await git.commit(`Merge pull request #${queueItem.pullRequest.number} from ${headBranch} (Conflict Resolved)`);

        // 7. Push (We are pushing to base branch directly here effectively merging it)
        // Wait, normally queue worker merges to a specific commit or base.
        // If we commit here, we are updating the local repo.
        // We need to return success/failure so the caller can update DB.

        // Actually, conflicts usually happen when we try to merge PR -> Base.
        // If we resolve it here, we have effectively performed the merge.
        // We should push the update to 'baseBranch' remote.
        await git.push("origin", baseBranch);

        return { success: true };

    } catch (e) {
        logger.error("Failed to resolve conflicts", e);
        try { await git.merge(["--abort"]); } catch { }
        throw e;
    } finally {
        await releaseRepo(repoOwner, repoName, true);
    }
}
