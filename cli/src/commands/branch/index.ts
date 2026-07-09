/**
 * Branch Commands
 * Manage git branches from the CLI
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { simpleGit } from "simple-git";

const git = simpleGit();

export const branchCommands = new Command("branch")
    .description("Manage branches");

// Branch Checkout (interactive)
branchCommands
    .command("checkout [branch]")
    .alias("co")
    .description("Checkout a branch (interactive if no branch specified)")
    .action(async (branch?: string) => {
        try {
            if (branch) {
                const spinner = ora(`Checking out ${branch}...`).start();
                await git.checkout(branch);
                spinner.succeed(`Checked out ${chalk.hex("#8be9fd")(branch)}`);
                return;
            }

            // Interactive mode
            const branches = await git.branchLocal();
            const currentBranch = branches.current;

            const choices = branches.all.map(b => ({
                name: b === currentBranch ? `${chalk.hex("#50fa7b")("●")} ${b} ${chalk.hex("#6272a4")("(current)")}` : `  ${b}`,
                value: b,
                short: b,
            }));

            const { selectedBranch } = await inquirer.prompt([
                {
                    type: "list",
                    name: "selectedBranch",
                    message: "Select branch to checkout:",
                    choices,
                    pageSize: 15,
                },
            ]);

            if (selectedBranch === currentBranch) {
                console.log(chalk.hex("#6272a4")("Already on that branch."));
                return;
            }

            const spinner = ora(`Checking out ${selectedBranch}...`).start();
            await git.checkout(selectedBranch);
            spinner.succeed(`Checked out ${chalk.hex("#8be9fd")(selectedBranch)}`);
        } catch (error) {
            console.error(chalk.hex("#ff5555")("Failed to checkout branch"));
            console.error(chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Branch Rename
branchCommands
    .command("rename [old-name] <new-name>")
    .alias("mv")
    .description("Rename a branch (renames current branch if old-name not specified)")
    .action(async (oldNameOrNewName: string, newName?: string) => {
        try {
            let oldBranch: string;
            let targetNewName: string;

            if (newName) {
                oldBranch = oldNameOrNewName;
                targetNewName = newName;
            } else {
                // Rename current branch
                const branches = await git.branchLocal();
                oldBranch = branches.current;
                targetNewName = oldNameOrNewName;
            }

            const spinner = ora(`Renaming ${oldBranch} to ${targetNewName}...`).start();

            await git.raw(["branch", "-m", oldBranch, targetNewName]);

            spinner.succeed(`Renamed ${chalk.hex("#8be9fd")(oldBranch)} to ${chalk.hex("#50fa7b")(targetNewName)}`);
        } catch (error) {
            console.error(chalk.hex("#ff5555")("Failed to rename branch"));
            console.error(chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Branch Delete
branchCommands
    .command("delete <branch>")
    .alias("rm")
    .description("Delete a branch")
    .option("-f, --force", "Force delete even if not merged")
    .option("-r, --remote", "Also delete remote branch")
    .action(async (branch: string, options) => {
        try {
            // Check if trying to delete current branch
            const branches = await git.branchLocal();
            if (branch === branches.current) {
                console.error(chalk.hex("#ff5555")("Cannot delete the current branch. Switch to another branch first."));
                process.exit(1);
            }

            const spinner = ora(`Deleting branch ${branch}...`).start();

            // Delete local branch
            if (options.force) {
                await git.branch(["-D", branch]);
            } else {
                await git.branch(["-d", branch]);
            }

            spinner.text = `Deleted local branch ${branch}`;

            // Delete remote branch if requested
            if (options.remote) {
                try {
                    await git.push(["origin", "--delete", branch]);
                    spinner.succeed(`Deleted ${chalk.hex("#8be9fd")(branch)} (local and remote)`);
                } catch (remoteError) {
                    spinner.warn(`Deleted local branch ${chalk.hex("#8be9fd")(branch)}, but failed to delete remote`);
                    console.error(chalk.hex("#6272a4")(remoteError instanceof Error ? remoteError.message : ""));
                }
            } else {
                spinner.succeed(`Deleted ${chalk.hex("#8be9fd")(branch)}`);
            }
        } catch (error) {
            console.error(chalk.hex("#ff5555")("Failed to delete branch"));
            console.error(chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Branch List
branchCommands
    .command("list")
    .alias("ls")
    .description("List branches")
    .option("-a, --all", "Show all branches including remote")
    .option("-r, --remote", "Show only remote branches")
    .action(async (options) => {
        try {
            let branches;

            if (options.all) {
                branches = await git.branch(["-a"]);
            } else if (options.remote) {
                branches = await git.branch(["-r"]);
            } else {
                branches = await git.branchLocal();
            }

            console.log(chalk.bold("\n🌿 Branches\n"));

            for (const branch of branches.all) {
                if (branch === branches.current) {
                    console.log(chalk.hex("#50fa7b")(`● ${branch}`) + chalk.hex("#6272a4")(" (current)"));
                } else if (branch.startsWith("remotes/")) {
                    console.log(chalk.hex("#6272a4")(`  ${branch.replace("remotes/", "")}`));
                } else {
                    console.log(`  ${branch}`);
                }
            }

            console.log("");
        } catch (error) {
            console.error(chalk.hex("#ff5555")("Failed to list branches"));
            console.error(chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Branch Create
branchCommands
    .command("create <name>")
    .alias("new")
    .description("Create a new branch")
    .option("-b, --base <branch>", "Base branch to create from")
    .option("-c, --checkout", "Checkout the new branch after creation")
    .action(async (name: string, options) => {
        try {
            const spinner = ora(`Creating branch ${name}...`).start();

            if (options.base) {
                await git.checkoutBranch(name, options.base);
                if (!options.checkout) {
                    // Go back to previous branch
                    await git.checkout("-");
                }
            } else if (options.checkout) {
                await git.checkoutLocalBranch(name);
            } else {
                await git.branch([name]);
            }

            if (options.checkout) {
                spinner.succeed(`Created and checked out ${chalk.hex("#50fa7b")(name)}`);
            } else {
                spinner.succeed(`Created branch ${chalk.hex("#50fa7b")(name)}`);
            }
        } catch (error) {
            console.error(chalk.hex("#ff5555")("Failed to create branch"));
            console.error(chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Branch Track
branchCommands
    .command("track <remote-branch>")
    .description("Create a local branch tracking a remote branch")
    .action(async (remoteBranch: string) => {
        try {
            const spinner = ora(`Tracking ${remoteBranch}...`).start();

            // Extract branch name from remote/branch format
            const branchName = remoteBranch.replace(/^origin\//, "");

            await git.checkout(["-b", branchName, "--track", `origin/${branchName}`]);

            spinner.succeed(`Created ${chalk.hex("#50fa7b")(branchName)} tracking ${chalk.hex("#8be9fd")(`origin/${branchName}`)}`);
        } catch (error) {
            console.error(chalk.hex("#ff5555")("Failed to track branch"));
            console.error(chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

export default branchCommands;
