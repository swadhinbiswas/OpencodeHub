#!/usr/bin/env node
/**
 * OpenCodeHub CLI
 * Complete Git hosting platform with stack-first PR workflows
 */

import { Command } from "commander";
import chalk from "chalk";
import { simpleGit } from "simple-git";

// Import all command modules
import { stackCommands } from "../src/commands/stack/index.js";
import { authCommands } from "../src/commands/auth.js";
import { pushRepo, cloneRepo, createRepo, listRepos } from "../src/commands/repo.js";
import { prCommands } from "../src/commands/pr/index.js";
import { issueCommands } from "../src/commands/issue/index.js";
import { ciCommands } from "../src/commands/ci/index.js";
import { queueCommands } from "../src/commands/queue/index.js";
import { reviewCommands } from "../src/commands/review/index.js";
import { metricsCommands } from "../src/commands/metrics/index.js";
import { configCommands } from "../src/commands/config/index.js";
import { branchCommands } from "../src/commands/branch/index.js";
import { releaseCommands } from "../src/commands/release/index.js";
import { searchCommands } from "../src/commands/search/index.js";
import { secretCommands } from "../src/commands/secret/index.js";
import { sshKeyCommands } from "../src/commands/ssh-key/index.js";
import { apiCommands } from "../src/commands/api/index.js";
import { inboxCommand } from "../src/commands/inbox/index.js";
import { notifyCommand } from "../src/commands/notify/index.js";
import { automateCommand } from "../src/commands/automate/index.js";
import { insightsCommand } from "../src/commands/insights/index.js";

const git = simpleGit();
const program = new Command();

program
    .name("och")
    .description("OpenCodeHub CLI - Complete Git hosting with stack-first PR workflows")
    .version("1.1.0");

// ================================
// Core Commands
// ================================

// Auth commands
program.addCommand(authCommands);

// Stack commands (Graphite-like workflow)
program.addCommand(stackCommands);

// PR commands (GitHub/GitLab style)
program.addCommand(prCommands);

// Issue commands
program.addCommand(issueCommands);

// CI/CD commands
program.addCommand(ciCommands);

// Merge Queue commands
program.addCommand(queueCommands);

// Review commands (including AI review)
program.addCommand(reviewCommands);

// Metrics commands
program.addCommand(metricsCommands);

// Inbox commands (Graphite-style PR inbox)
program.addCommand(inboxCommand);

// Notification commands
program.addCommand(notifyCommand);

// Automation commands
program.addCommand(automateCommand);

// Insights commands
program.addCommand(insightsCommand);

// ================================
// Repository Commands
// ================================

const repoCommand = program
    .command("repo")
    .description("Repository management");

repoCommand
    .command("push")
    .description("Push local repository to OpenCodeHub")
    .option("-b, --branch <branch>", "Branch to push")
    .option("-f, --force", "Force push (overwrite remote)")
    .action(async (options) => {
        await pushRepo(options);
    });

repoCommand
    .command("clone <repo>")
    .description("Clone a repository from OpenCodeHub")
    .argument("[destination]", "Local directory to clone into")
    .action(async (repo, destination) => {
        await cloneRepo(repo, destination);
    });

repoCommand
    .command("create <name>")
    .description("Create a new repository on OpenCodeHub")
    .option("-d, --description <desc>", "Repository description")
    .option("-p, --private", "Make repository private")
    .option("--no-init", "Don't initialize with README")
    .action(async (name, options) => {
        await createRepo({
            name,
            description: options.description,
            visibility: options.private ? "private" : "public",
            init: options.init,
        });
    });

repoCommand
    .command("list")
    .alias("ls")
    .description("List your repositories")
    .action(async () => {
        await listRepos();
    });

// ================================
// Branch & Config Commands
// ================================

program.addCommand(branchCommands);
program.addCommand(configCommands);

// ================================
// Advanced Commands
// ================================

program.addCommand(releaseCommands);
program.addCommand(searchCommands);
program.addCommand(secretCommands);
program.addCommand(sshKeyCommands);
program.addCommand(apiCommands);

// ================================
// Shorthand Commands
// ================================

// Stacking Commands (Graphite-inspired)
program
    .command("stack")
    .description("Manage stacked pull requests")
    .command("submit")
    .description("Submit the current branch as a stacked PR")
    .option("-m, --message <message>", "PR Title/Description")
    .action(async (options) => {
        console.log("🚀 Submitting stack...");

        // 1. Git Push
        try {
            const { execSync } = require('child_process');
            const branch = execSync('git iconv -futf-8 -tutf-8 branch --show-current').toString().trim();
            console.log(`Pushing branch ${branch}...`);
            execSync(`git push origin ${branch}`); // Assumes 'origin' is set
        } catch (e: any) {
            console.error("Failed to push branch:", e.message);
            return;
        }

        // 2. Identify PR Context
        // We need to know who we are (config) and where we are (remote)
        // For MVP, just log instructions
        console.log(`✅ Branch pushed. To create/update stack, visit OpenCodeHub or use 'och pr create' (coming soon).`);
    });

program
    .command("queue")
    .description("Manage merge queue")
    .command("join")
    .description("Add the current PR to the merge queue")
    .action(async () => {
        console.log("⏳ Adding to merge queue...");

        try {
            const { execSync } = require('child_process');
            const branch = execSync('git branch --show-current').toString().trim();
            // Parse remote to get owner/repo
            const remoteUrl = execSync('git remote get-url origin').toString().trim();
            // Regex to match http://host/owner/repo.git or git@...
            // MVP: Assume standard format
            // This requires robust parsing.

            console.log(`Detected branch: ${branch}`);
            console.log(`Use 'cho queue join <pr-id>' implementation pending API client config.`);

            // Real implementation requires Authenticated API Client
            // which involves reading ~/.och/config.json
            // I will stub this with a TODO for the user to configure auth first.

            console.log("⚠️  Please configure CLI authentication first.");
        } catch (e: any) {
            console.error("Error:", e.message);
        }
    });

// och push (shorthand for repo push)
program
    .command("push")
    .description("Push to OpenCodeHub (shorthand for 'repo push')")
    .option("-b, --branch <branch>", "Branch to push")
    .option("-f, --force", "Force push")
    .action(async (options) => {
        await pushRepo(options);
    });

// och init
program
    .command("init")
    .description("Initialize repository for OpenCodeHub")
    .option("-u, --url <url>", "OpenCodeHub server URL")
    .action(async (options) => {
        console.log(chalk.blue("Initializing repository for OpenCodeHub..."));

        const { saveConfig } = await import("../src/lib/config.js");
        if (options.url) {
            saveConfig({ serverUrl: options.url });
            console.log(chalk.green(`✓ Server URL set to ${options.url}`));
        }

        // Check if git repo exists
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
            console.log(chalk.yellow("Not a git repository. Initialize with 'git init' first."));
            return;
        }

        console.log(chalk.green("✓ Repository initialized for OpenCodeHub"));
        console.log(chalk.dim("\nNext steps:"));
        console.log(chalk.dim("  1. Run 'och auth login' to authenticate"));
        console.log(chalk.dim("  2. Run 'och repo create <name>' to create remote"));
        console.log(chalk.dim("  3. Run 'och push' to push your code"));
    });

// och sync (bidirectional sync)
program
    .command("sync")
    .description("Sync with remote (fetch + push)")
    .option("-f, --force", "Force push after sync")
    .action(async (options) => {
        const ora = (await import("ora")).default;
        const spinner = ora("Syncing with remote...").start();

        try {
            spinner.text = "Fetching from remote...";
            await git.fetch();

            spinner.text = "Pulling changes...";
            try {
                await git.pull(["--rebase"]);
            } catch (e) {
                // May fail if no upstream
            }

            spinner.text = "Pushing changes...";
            const pushArgs = options.force ? ["--force-with-lease"] : [];
            await git.push(pushArgs);

            spinner.succeed("Synced with remote");
        } catch (error) {
            spinner.fail("Sync failed");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// och status (stack status)
program
    .command("status")
    .alias("st")
    .description("Show current stack and branch status")
    .action(async () => {
        try {
            const isRepo = await git.checkIsRepo();
            if (!isRepo) {
                console.log(chalk.yellow("Not a git repository. Run this command inside a git repository."));
                return;
            }

            const branches = await git.branchLocal();
            const currentBranch = branches.current;
            const stackBranches = branches.all.filter(b => b.startsWith("stack/"));

            console.log(chalk.bold("\n📊 Status\n"));
            console.log(`Current branch: ${chalk.cyan(currentBranch)}`);

            if (stackBranches.length > 0) {
                console.log(`\nStack branches: ${stackBranches.length}`);
                for (const branch of stackBranches) {
                    const isCurrent = branch === currentBranch;
                    const marker = isCurrent ? chalk.yellow("●") : chalk.dim("○");
                    console.log(`  ${marker} ${isCurrent ? chalk.bold(branch) : branch}`);
                }
            }

            // Show git status
            const status = await git.status();
            if (status.modified.length > 0 || status.not_added.length > 0 || status.staged.length > 0) {
                console.log(chalk.bold("\nChanges:"));
                if (status.staged.length > 0) {
                    console.log(chalk.green(`  Staged: ${status.staged.length} files`));
                }
                if (status.modified.length > 0) {
                    console.log(chalk.yellow(`  Modified: ${status.modified.length} files`));
                }
                if (status.not_added.length > 0) {
                    console.log(chalk.red(`  Untracked: ${status.not_added.length} files`));
                }
            } else {
                console.log(chalk.dim("\nWorking tree clean"));
            }

            console.log("");
        } catch (error) {
            console.error(chalk.red("\nError checking status:"));
            console.error(chalk.dim(error instanceof Error ? error.message : "Unknown error"));
        }
    });

// och whoami (alias for auth status)
program
    .command("whoami")
    .description("Show current authenticated user")
    .action(async () => {
        const { getConfig } = await import("../src/lib/config.js");
        const config = getConfig();

        if (!config.token) {
            console.log(chalk.yellow("Not authenticated"));
            console.log(chalk.dim("Run 'och auth login' to authenticate"));
            return;
        }

        const ora = (await import("ora")).default;
        const spinner = ora("Checking authentication...").start();

        try {
            const response = await fetch(`${config.serverUrl}/api/user`, {
                headers: { "Authorization": `Bearer ${config.token}` },
            });

            if (response.ok) {
                const userData = await response.json();
                spinner.stop();
                console.log(userData.data?.username || "unknown");
            } else {
                spinner.fail("Token is invalid or expired");
            }
        } catch {
            spinner.fail("Could not connect to server");
        }
    });

// ================================
// Completions Command
// ================================

program
    .command("completion")
    .description("Generate shell completions")
    .argument("<shell>", "Shell type (bash, zsh, fish)")
    .action((shell: string) => {
        const shells: Record<string, string> = {
            bash: `
# OpenCodeHub CLI bash completion
_och_completions() {
    local cur="\${COMP_WORDS[COMP_CWORD]}"
    local commands="auth stack pr issue ci queue review metrics repo branch config release search secret ssh-key api push init sync status whoami"
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
}
complete -F _och_completions och
`,
            zsh: `
# OpenCodeHub CLI zsh completion
#compdef och

_och() {
    local -a commands
    commands=(
        'auth:Manage authentication'
        'stack:Manage stacked PRs'
        'pr:Manage pull requests'
        'issue:Manage issues'
        'ci:Manage CI/CD pipelines'
        'queue:Manage merge queue'
        'review:Manage code reviews'
        'metrics:View developer metrics'
        'repo:Repository management'
        'branch:Branch management'
        'config:CLI configuration'
        'release:Manage releases'
        'search:Search repositories, issues, PRs'
        'secret:Manage secrets'
        'ssh-key:Manage SSH keys'
        'api:Direct API access'
        'push:Push to remote'
        'init:Initialize repository'
        'sync:Sync with remote'
        'status:Show status'
        'whoami:Show current user'
    )
    _describe 'command' commands
}

compdef _och och
`,
            fish: `
# OpenCodeHub CLI fish completion
complete -c och -f
complete -c och -n "__fish_use_subcommand" -a "auth" -d "Manage authentication"
complete -c och -n "__fish_use_subcommand" -a "stack" -d "Manage stacked PRs"
complete -c och -n "__fish_use_subcommand" -a "pr" -d "Manage pull requests"
complete -c och -n "__fish_use_subcommand" -a "issue" -d "Manage issues"
complete -c och -n "__fish_use_subcommand" -a "ci" -d "Manage CI/CD pipelines"
complete -c och -n "__fish_use_subcommand" -a "queue" -d "Manage merge queue"
complete -c och -n "__fish_use_subcommand" -a "review" -d "Manage code reviews"
complete -c och -n "__fish_use_subcommand" -a "metrics" -d "View developer metrics"
complete -c och -n "__fish_use_subcommand" -a "repo" -d "Repository management"
complete -c och -n "__fish_use_subcommand" -a "branch" -d "Branch management"
complete -c och -n "__fish_use_subcommand" -a "config" -d "CLI configuration"
complete -c och -n "__fish_use_subcommand" -a "release" -d "Manage releases"
complete -c och -n "__fish_use_subcommand" -a "search" -d "Search repos, issues, PRs"
complete -c och -n "__fish_use_subcommand" -a "secret" -d "Manage secrets"
complete -c och -n "__fish_use_subcommand" -a "ssh-key" -d "Manage SSH keys"
complete -c och -n "__fish_use_subcommand" -a "api" -d "Direct API access"
complete -c och -n "__fish_use_subcommand" -a "push" -d "Push to remote"
complete -c och -n "__fish_use_subcommand" -a "init" -d "Initialize repository"
complete -c och -n "__fish_use_subcommand" -a "sync" -d "Sync with remote"
complete -c och -n "__fish_use_subcommand" -a "status" -d "Show status"
complete -c och -n "__fish_use_subcommand" -a "whoami" -d "Show current user"
`,
        };

        if (!shells[shell]) {
            console.error(chalk.red(`Unknown shell: ${shell}`));
            console.log(chalk.dim("Supported shells: bash, zsh, fish"));
            process.exit(1);
        }

        console.log(shells[shell]);
    });

// ================================
// Parse and Execute
// ================================

program.parse(process.argv);

// Show help if no arguments
if (process.argv.length === 2) {
    program.help();
}
