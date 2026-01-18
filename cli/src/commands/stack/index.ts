/**
 * Stack Commands
 * Manage stacked PRs from the CLI
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { simpleGit } from "simple-git";
import { getConfig, saveConfig } from "../../lib/config.js";
import { apiCall } from "../../lib/api.js";

const git = simpleGit();

export const stackCommands = new Command("stack")
    .description("Manage stacked PRs");

// Create a new branch in the stack
stackCommands
    .command("create <name>")
    .description("Create a new branch in the current stack")
    .option("-m, --message <message>", "Commit message for work in progress")
    .action(async (name: string, options) => {
        const spinner = ora("Creating stacked branch...").start();

        try {
            // Get current branch
            const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]);

            // Create new branch
            const newBranch = `stack/${name}`;
            await git.checkoutLocalBranch(newBranch);

            spinner.succeed(`Created branch ${chalk.green(newBranch)} (stacked on ${chalk.cyan(currentBranch.trim())})`);

            console.log("\n" + chalk.dim("Next steps:"));
            console.log(chalk.dim("  • Make your changes"));
            console.log(chalk.dim("  • Run ") + chalk.cyan("och stack submit") + chalk.dim(" to push and create PRs"));
        } catch (error) {
            spinner.fail("Failed to create branch");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Submit stack to remote and create PRs
stackCommands
    .command("submit")
    .description("Push stack and create/update PRs for all branches")
    .option("-d, --draft", "Create PRs as drafts")
    .option("-m, --message <message>", "PR title prefix")
    .action(async (options) => {
        const config = getConfig();

        if (!config.token) {
            console.error(chalk.red("Not logged in. Run 'och auth login' first."));
            process.exit(1);
        }

        const spinner = ora("Analyzing stack...").start();

        try {
            // Get all stack branches
            const branches = await git.branchLocal();
            const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
            const stackBranches = branches.all.filter(b => b.startsWith("stack/"));

            if (stackBranches.length === 0) {
                spinner.fail("No stack branches found");
                console.log(chalk.dim("Run ") + chalk.cyan("och stack create <name>") + chalk.dim(" to start a stack."));
                process.exit(1);
            }

            // Get repository info from git remote
            const remotes = await git.getRemotes(true);
            const origin = remotes.find(r => r.name === "origin");

            if (!origin?.refs?.push) {
                spinner.fail("No origin remote found");
                process.exit(1);
            }

            // Parse owner/repo from remote URL
            const remoteUrl = origin.refs.push;
            const match = remoteUrl.match(/[:/]([^/]+)\/([^/.]+)/);

            if (!match) {
                spinner.fail("Could not parse repository from remote URL");
                process.exit(1);
            }

            const [, owner, repoName] = match;

            // Push all stack branches
            spinner.text = "Pushing branches...";
            const pushedBranches: string[] = [];

            for (const branch of stackBranches) {
                try {
                    await git.push(["-u", "origin", branch, "--force-with-lease"]);
                    pushedBranches.push(branch);
                } catch (e) {
                    console.log(chalk.yellow(`\n  Warning: Could not push ${branch}`));
                }
            }

            spinner.text = "Creating PRs...";

            // Build branch metadata for PR creation
            const branchData = stackBranches.map((branch, index) => {
                const name = branch.replace("stack/", "");
                const parentBranch = index === 0 ? "main" : stackBranches[index - 1];

                return {
                    name: branch,
                    title: options.message ? `${options.message}: ${name}` : `[Stack] ${name}`,
                    description: `Part of stacked PR workflow.\n\nBranch: \`${branch}\`\nBased on: \`${parentBranch}\``,
                    parentBranch,
                };
            });

            // Create PRs via API
            try {
                const response = await fetch(`${config.serverUrl}/api/stacks`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${config.token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        owner,
                        repo: repoName,
                        baseBranch: "main",
                        branches: branchData,
                    }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || "Failed to create PRs");
                }

                const result = await response.json();

                spinner.succeed(`Stack submitted with ${pushedBranches.length} branches`);

                if (result.data?.stack?.pullRequests) {
                    console.log(chalk.bold("\n📋 Pull Requests Created:\n"));
                    for (const pr of result.data.stack.pullRequests) {
                        console.log(`  ${chalk.green("●")} #${pr.number}: ${pr.title}`);
                        console.log(chalk.dim(`    ${pr.branch} → ${pr.baseBranch}`));
                    }
                }
            } catch (apiError) {
                // API might not be available, just show success for pushing
                spinner.succeed(`Pushed ${pushedBranches.length} branches`);
                console.log(chalk.yellow("\n  Note: Could not auto-create PRs (API unavailable)"));
                console.log(chalk.dim("  Create PRs manually at your repository\n"));
            }

            console.log(chalk.dim("\nNext steps:"));
            console.log(chalk.dim("  • Get reviews on your PRs"));
            console.log(chalk.dim("  • Run ") + chalk.cyan("och stack sync") + chalk.dim(" to keep in sync"));
        } catch (error) {
            spinner.fail("Failed to submit stack");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// View current stack
stackCommands
    .command("view")
    .alias("ls")
    .alias("log")
    .description("View current stack visualization (like gt log)")
    .action(async () => {
        try {
            const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]);
            const branches = await git.branchLocal();

            console.log(chalk.bold("\n📚 Current Stack\n"));

            // Find stack branches
            const stackBranches = branches.all.filter(b => b.startsWith("stack/"));

            if (stackBranches.length === 0) {
                console.log(chalk.dim("  No stack branches found."));
                console.log(chalk.dim("  Run ") + chalk.cyan("och stack create <name>") + chalk.dim(" to start a stack."));
                return;
            }

            // Display stack
            console.log(chalk.dim("  ┌─ ") + chalk.green("main") + chalk.dim(" (base)"));

            for (let i = 0; i < stackBranches.length; i++) {
                const branch = stackBranches[i];
                const isCurrent = currentBranch.trim() === branch;
                const prefix = i === stackBranches.length - 1 ? "└─" : "├─";

                if (isCurrent) {
                    console.log(chalk.dim("  │"));
                    console.log(chalk.dim(`  ${prefix} `) + chalk.yellow.bold("● " + branch) + chalk.yellow(" (current)"));
                } else {
                    console.log(chalk.dim("  │"));
                    console.log(chalk.dim(`  ${prefix} `) + chalk.cyan("○ " + branch));
                }
            }

            console.log("");
        } catch (error) {
            console.error(chalk.red("Failed to view stack"));
            process.exit(1);
        }
    });

// Sync stack with remote
stackCommands
    .command("sync")
    .description("Bidirectional sync with remote")
    .option("-p, --push", "Push local changes to remote")
    .option("-l, --pull", "Pull remote changes to local")
    .option("-f, --force", "Force push (use with caution)")
    .action(async (options) => {
        const spinner = ora("Syncing stack...").start();

        try {
            // Fetch latest
            spinner.text = "Fetching from remote...";
            await git.fetch();

            const branches = await git.branchLocal();
            const stackBranches = branches.all.filter(b => b.startsWith("stack/"));

            if (stackBranches.length === 0) {
                spinner.info("No stack branches found");
                return;
            }

            const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]);

            // Default: do both push and pull if neither specified
            const doPush = options.push || (!options.push && !options.pull);
            const doPull = options.pull || (!options.push && !options.pull);

            let syncedCount = 0;
            const errors: string[] = [];

            for (const branch of stackBranches) {
                spinner.text = `Syncing ${branch}...`;

                try {
                    await git.checkout(branch);

                    if (doPull) {
                        // Pull with rebase
                        try {
                            await git.pull(["--rebase", "origin", branch]);
                        } catch (e) {
                            // Branch might not exist on remote yet
                        }
                    }

                    if (doPush) {
                        const pushArgs = ["-u", "origin", branch];
                        if (options.force) {
                            pushArgs.unshift("--force-with-lease");
                        }
                        await git.push(pushArgs);
                    }

                    syncedCount++;
                } catch (error) {
                    errors.push(`${branch}: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
            }

            // Return to original branch
            await git.checkout(currentBranch.trim());

            if (errors.length > 0) {
                spinner.warn(`Synced ${syncedCount}/${stackBranches.length} branches`);
                console.log(chalk.yellow("\nIssues:"));
                errors.forEach(e => console.log(chalk.dim(`  • ${e}`)));
            } else {
                spinner.succeed(`Synced ${syncedCount} branches successfully`);
            }
        } catch (error) {
            spinner.fail("Failed to sync stack");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            console.log(chalk.dim("\nIf there are conflicts, resolve them and run:"));
            console.log(chalk.cyan("  git rebase --continue"));
            process.exit(1);
        }
    });

// Stack status
stackCommands
    .command("status")
    .alias("st")
    .description("Show sync status for all stack branches")
    .action(async () => {
        const spinner = ora("Checking status...").start();

        try {
            await git.fetch();

            const branches = await git.branchLocal();
            const stackBranches = branches.all.filter(b => b.startsWith("stack/"));
            const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]);

            spinner.stop();

            if (stackBranches.length === 0) {
                console.log(chalk.dim("\nNo stack branches found."));
                return;
            }

            console.log(chalk.bold("\n📊 Stack Status\n"));

            for (const branch of stackBranches) {
                const isCurrent = currentBranch.trim() === branch;

                // Get ahead/behind
                let ahead = 0;
                let behind = 0;
                let hasRemote = true;

                try {
                    const log = await git.raw([
                        "rev-list", "--left-right", "--count",
                        `${branch}...origin/${branch}`
                    ]);
                    [ahead, behind] = log.trim().split("\t").map(Number);
                } catch {
                    hasRemote = false;
                }

                // Build status line
                let status = "";
                if (!hasRemote) {
                    status = chalk.yellow("⚠ not pushed");
                } else if (ahead > 0 && behind > 0) {
                    status = chalk.red(`↑${ahead} ↓${behind} diverged`);
                } else if (ahead > 0) {
                    status = chalk.cyan(`↑${ahead} ahead`);
                } else if (behind > 0) {
                    status = chalk.magenta(`↓${behind} behind`);
                } else {
                    status = chalk.green("✓ synced");
                }

                const marker = isCurrent ? chalk.yellow("● ") : chalk.dim("○ ");
                console.log(`  ${marker}${isCurrent ? chalk.bold(branch) : branch}  ${status}`);
            }

            console.log("");
        } catch (error) {
            spinner.fail("Failed to get status");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Rebase entire stack
stackCommands
    .command("rebase")
    .description("Rebase entire stack on base branch")
    .option("-b, --base <branch>", "Base branch to rebase on", "main")
    .action(async (options) => {
        const spinner = ora(`Rebasing stack on ${options.base}...`).start();

        try {
            // Fetch latest
            await git.fetch();

            // Rebase
            await git.rebase([options.base]);

            spinner.succeed(`Stack rebased on ${chalk.green(options.base)}`);
        } catch (error) {
            spinner.fail("Failed to rebase stack");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

export default stackCommands;
