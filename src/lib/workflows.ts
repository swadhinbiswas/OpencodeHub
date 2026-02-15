
import { PipelineRunner } from "./pipeline";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

// Initialize Runner (Singleton-ish for this context)
const runner = new PipelineRunner({
    workDir: path.join(process.cwd(), "data", "runner", "work"),
    artifactsDir: path.join(process.cwd(), "data", "runner", "artifacts"),
    cacheDir: path.join(process.cwd(), "data", "runner", "cache")
});

// Ensure dirs exist
async function ensureDirs() {
    await fs.mkdir(path.join(process.cwd(), "data", "runner", "work"), { recursive: true });
    await fs.mkdir(path.join(process.cwd(), "data", "runner", "artifacts"), { recursive: true });
    await fs.mkdir(path.join(process.cwd(), "data", "runner", "cache"), { recursive: true });
}
ensureDirs();


export async function triggerRepoWorkflows(repoId: string, commitSha: string, ref: string, pusherId: string) {
    logger.info({ repoId, ref, commitSha }, "Checking workflows");

    try {
        // 1. Get Repo Disk Path
        const db = getDatabase() as NodePgDatabase<typeof schema>;
        const repo = await db.query.repositories.findFirst({
            where: eq(schema.repositories.id, repoId)
        });

        if (!repo) return;

        // 2. For cloud storage, we need to resolve the repo path to a local directory
        //    For local storage, diskPath is already local.
        const { resolveRepoPath } = await import("./git-storage");
        const { getGit } = await import("./git");

        let localRepoPath: string;
        try {
            localRepoPath = await resolveRepoPath(repo.diskPath);
        } catch (resolveErr) {
            // If we can't resolve the path (e.g., repo doesn't exist yet in storage), skip workflows
            logger.debug({ err: resolveErr, diskPath: repo.diskPath }, "Could not resolve repo path for workflows, skipping");
            return;
        }

        const git = getGit(localRepoPath);

        // Look for .github/workflows/*.yml in the actual repo content
        // List files in .github/workflows
        const treeInfo = await git.raw(["ls-tree", "-r", "--name-only", commitSha, ".github/workflows"]);
        const workflowFiles = treeInfo.split("\n").filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));

        if (workflowFiles.length === 0) {
            logger.debug("No workflows found");
            return;
        }

        logger.info({ count: workflowFiles.length, files: workflowFiles }, "Found workflows");

        // 3. Process each workflow
        for (const file of workflowFiles) {
            try {
                const content = await git.show([`${commitSha}:${file}`]);

                // Parse manually since PipelineRunner expects a file path usually, 
                // but we can create a temp file or refactor runner.
                // Let's write to a temp file for the runner to parse
                const tempWorkflowPath = path.join("/tmp", `workflow-${crypto.randomUUID()}.yml`);
                await fs.writeFile(tempWorkflowPath, content);

                const config = await runner.parseWorkflow(tempWorkflowPath);
                await fs.unlink(tempWorkflowPath); // Clean up

                // Get changed files by diffing with parent commit
                let changedPaths: string[] = [];
                try {
                    // Get parent commit(s)
                    const parentOutput = await git.raw(["rev-parse", `${commitSha}^`]).catch(() => "");
                    const parentSha = parentOutput.trim();

                    if (parentSha) {
                        // Get diff between parent and current commit
                        const diffOutput = await git.raw([
                            "diff", "--name-only", parentSha, commitSha
                        ]);
                        changedPaths = diffOutput.split("\n").filter(Boolean);
                        logger.debug({ changedPaths, count: changedPaths.length }, "Changed files in push");
                    } else {
                        // Initial commit - all files are new
                        const treeOutput = await git.raw(["ls-tree", "-r", "--name-only", commitSha]);
                        changedPaths = treeOutput.split("\n").filter(Boolean);
                        logger.debug({ changedPaths, count: changedPaths.length }, "Initial commit files");
                    }
                } catch (diffErr) {
                    logger.warn({ err: diffErr }, "Could not get changed paths, skipping path filter");
                }

                // Check Trigger with path filtering
                const shouldRun = runner.shouldTrigger(config, "push", {
                    ref: ref,
                    paths: changedPaths.length > 0 ? changedPaths : undefined,
                });

                if (shouldRun) {
                    logger.info({ workflow: config.name }, "Triggering workflow");

                    // Run it (Fire and forget, or track?)
                    runner.runWorkflow(config, {
                        repositoryId: repoId,
                        repositoryPath: repo.diskPath,
                        branch: ref.replace("refs/heads/", ""),
                        commit: commitSha,
                        triggeredBy: "push",
                        triggerEvent: "push"
                    }).catch(err => {
                        logger.error({ err, workflow: config.name }, "Workflow failed");
                    });
                } else {
                    logger.debug({ workflow: config.name }, "Skipping workflow (conditions not met)");
                }

            } catch (e) {
                logger.error({ err: e, file }, "Error processing workflow");
            }
        }

    } catch (e) {
        // likely dir doesn't exist
        // console.log("   No .github/workflows directory or error checking.");
    }
}
