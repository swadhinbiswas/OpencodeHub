
import { PipelineRunner } from "./pipeline";
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

    // 1. Get Repo Disk Path
    const db = getDatabase();
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repoId)
    });

    if (!repo) return;

    // 2. Look for .github/workflows/*.yml in the actual repo content
    // Since it's a bare repo, we need to inspect the tree at commitSha.
    // For simplicity in this "MVP Plus", we will assume we can extract them using 'git show'
    // or if we have a working copy. 
    // Implementing "git show HEAD:.github/workflows/main.yml" logic:

    // Check if workflows exist in the commit
    const { getGit } = await import("./git");
    const git = getGit(repo.diskPath);

    try {
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

                // Check Trigger
                const shouldRun = runner.shouldTrigger(config, "push", {
                    ref: ref,
                    // TODO: Implement path filtering by diffing with parent
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
