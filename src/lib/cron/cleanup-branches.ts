import { simpleGit } from "simple-git";
import { logger } from "@/lib/logger";
import { getDatabase, schema } from "@/db";
import path from "path";

const REPOS_BASE_PATH = process.env.REPOS_PATH || path.join(process.cwd(), "data", "repos");

export async function cleanupAllRepos() {
    const db = getDatabase();
    const repos = await db.query.repositories.findMany();

    for (const repo of repos) {
        if (repo.diskPath) {
            const repoPath = path.join(REPOS_BASE_PATH, repo.diskPath);
            await cleanupSpeculativeBranches(repoPath);
        }
    }
}

/**
 * Cleanup stale speculative branches
 * Deletes branches starting with 'mq-spec-' that are older than X hours
 */
export async function cleanupSpeculativeBranches(repoPath: string, maxAgeHours: number = 24) {
    const git = simpleGit(repoPath);

    try {
        await git.fetch("origin", "--prune");
        const branches = await git.branchLocal();

        const now = Date.now();
        const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

        let deletedCount = 0;

        for (const branch of branches.all) {
            if (branch.startsWith("mq-spec-")) {
                // Parse timestamp from branch name: mq-spec-{timestamp}-{prNumbers}
                const parts = branch.split("-");
                if (parts.length >= 3) {
                    const timestamp = parseInt(parts[2], 10);

                    if (!isNaN(timestamp) && (now - timestamp > maxAgeMs)) {
                        try {
                            await git.deleteLocalBranch(branch, true); // Force delete
                            logger.info({ branch }, "Deleted stale speculative branch");
                            deletedCount++;
                        } catch (e) {
                            logger.error({ branch, error: e }, "Failed to delete stale branch");
                        }
                    }
                }
            }
        }

        if (deletedCount > 0) {
            logger.info({ deletedCount }, "Speculative branch cleanup completed");
        }

    } catch (error) {
        logger.error({ error, repoPath }, "Failed to run speculative branch cleanup");
    }
}
