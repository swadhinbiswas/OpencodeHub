
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "@/lib/logger";
import { getCommits, getRepoSize, listFiles, getCommitDiff } from "./git";
import { eq } from "drizzle-orm";
import { extname } from "path";

/**
 * Map extensions to Languages
 */
const EXT_MAP: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".rs": "Rust",
    ".go": "Go",
    ".py": "Python",
    ".java": "Java",
    ".c": "C",
    ".cpp": "C++",
    ".h": "C++",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "CSS",
    ".json": "JSON",
    ".md": "Markdown",
    ".yml": "YAML",
    ".yaml": "YAML",
    ".toml": "TOML",
    ".sh": "Shell",
    ".astro": "Astro"
};

export async function analyzeRepository(repoId: string, userId: string | null = null, force = false) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // 1. Get Repo Info
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repoId)
    });

    if (!repo) return;

    logger.info({ repo: repo.name }, "Analyzing repository");

    try {
        // 2. Sync Commits (Last 20 to update recent history)
        // In a full system we'd diff 'refs/heads/main' vs DB, but here we just fetch recent
        const commits = await getCommits(repo.diskPath, { limit: 20 });
        let newCommitsCount = 0;

        for (const c of commits) {
            // Check existence (simple implementation, optimized would be "NOT IN")
            const exists = await db.query.commits.findFirst({
                where: eq(schema.commits.sha, c.sha)
            });

            if (!exists) {
                // Get diff stats
                const diffs = await getCommitDiff(repo.diskPath, c.sha);
                const additions = diffs.reduce((sum, d) => sum + d.additions, 0);
                const deletions = diffs.reduce((sum, d) => sum + d.deletions, 0);

                // Safely convert dates, falling back to current time if invalid
                const safeDate = (d: Date) => (d && !isNaN(d.getTime())) ? d.toISOString() : new Date().toISOString();

                await db.insert(schema.commits).values({
                    id: crypto.randomUUID(),
                    repositoryId: repo.id,
                    sha: c.sha,
                    message: c.message,
                    authorName: c.authorName,
                    authorEmail: c.authorEmail,
                    authorDate: safeDate(c.authorDate),
                    committerName: c.committerName,
                    committerEmail: c.committerEmail,
                    committerDate: safeDate(c.committerDate),
                    parentShas: c.parentShas.join(" "),
                    stats: JSON.stringify({ additions, deletions, files_changed: diffs.length }),
                    userId: userId // Link to user if passed (pusher)
                } as any);
                newCommitsCount++;
            }
        }
        logger.info({ newCommitsCount }, "Synced new commits");

        // 3. Analyze Languages
        // Scan HEAD files
        const files = await listFiles(repo.diskPath, "HEAD");
        const langCounts: Record<string, number> = {};

        for (const file of files) {
            if (file.type === 'file') {
                const ext = extname(file.name).toLowerCase();
                const lang = EXT_MAP[ext] || "Other";
                langCounts[lang] = (langCounts[lang] || 0) + 1; // Count files for simplicity, or query size for bytes
            }
        }

        await db.update(schema.repositories)
            .set({
                languages: JSON.stringify(langCounts),
                updatedAt: new Date()
            })
            .where(eq(schema.repositories.id, repoId));

        logger.info({ languages: Object.keys(langCounts) }, "Updated languages");

        // 4. Log Activity if there were new commits and we have a user
        if (newCommitsCount > 0 && userId) {
            await db.insert(schema.activities).values({
                id: crypto.randomUUID(),
                userId: userId,
                repositoryId: repoId,
                type: "push",
                action: "PUSH",
                targetType: "repository",
                targetId: repoId,
                payload: JSON.stringify({
                    commit_count: newCommitsCount,
                    head_commit: commits[0]?.sha,
                    message: commits[0]?.message
                }),
                createdAt: new Date()
            });
        }

    } catch (e) {
        logger.error({ err: e }, "Analysis failed");
    }
}
