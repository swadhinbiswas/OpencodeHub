#!/usr/bin/env node
/**
 * OpenCodeHub CLI
 * Complete Git hosting platform with stack-first PR workflows
 */

import chalk from "chalk";
import { Command } from "commander";
import { simpleGit } from "simple-git";
import boxen from "boxen";
import figlet from "figlet";
import gradient from "gradient-string";

// Import all command modules
import { apiCommands } from "../src/commands/api/index.js";
import { authCommands } from "../src/commands/auth.js";
import { automateCommand } from "../src/commands/automate/index.js";
import { branchCommands } from "../src/commands/branch/index.js";
import { ciCommands } from "../src/commands/ci/index.js";
import { configCommands } from "../src/commands/config/index.js";
import { focusCommand } from "../src/commands/focus/index.js";
import { inboxCommand } from "../src/commands/inbox/index.js";
import { insightsCommand } from "../src/commands/insights/index.js";
import { issueCommands } from "../src/commands/issue/index.js";
import { metricsCommands } from "../src/commands/metrics/index.js";
import { notifyCommand } from "../src/commands/notify/index.js";
import { prCommands } from "../src/commands/pr/index.js";
import { queueCommands } from "../src/commands/queue/index.js";
import { releaseCommands } from "../src/commands/release/index.js";
import { runnerCommands } from "../src/commands/runner/index.js";
import {
  cloneRepo,
  createRepo,
  listRepos,
  pushRepo,
} from "../src/commands/repo.js";
import { reviewCommands } from "../src/commands/review/index.js";
import { searchCommands } from "../src/commands/search/index.js";
import { secretCommands } from "../src/commands/secret/index.js";
import { sshKeyCommands } from "../src/commands/ssh-key/index.js";
import { stackCommands } from "../src/commands/stack/index.js";

const git = simpleGit();
const program = new Command();

if (!process.stdout.isTTY) {
  chalk.level = 0;
}

// Custom help formatter with Dracula theme
program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => chalk.hex("#bd93f9")(cmd.name()), // Dracula purple
});

// Add custom help banner with Dracula colors
program.addHelpText("beforeAll", () => {
  const ascii = figlet.textSync("OpenCodeHub", { font: "Standard" });
  const gradientText = gradient.pastel.multiline(ascii);
  
  const box = boxen(gradientText + "\n" + chalk.hex("#6272a4")("Stack-first ") + chalk.hex("#bd93f9").bold("PR workflows") + chalk.hex("#6272a4")(" from your terminal"), {
    padding: 1,
    margin: 1,
    borderStyle: "round",
    borderColor: "cyan",
    title: "OCH CLI",
    titleAlignment: "center"
  });

  return box + "\n";
});

function isHiddenCommand(cmd: Command) {
  return Boolean((cmd as { hidden?: boolean }).hidden);
}

function buildCommandTable() {
  const commands = program.commands
    .filter((cmd) => !isHiddenCommand(cmd))
    .map((cmd) => ({
      name: cmd.name(),
      desc: cmd.description() || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const maxDescWidth = 46;
  const nameWidth = Math.max(
    "Command".length,
    ...commands.map((c) => c.name.length),
  );
  const descWidth = Math.min(
    maxDescWidth,
    Math.max("Description".length, ...commands.map((c) => c.desc.length)),
  );

  const top = `  ┌${"─".repeat(nameWidth + 2)}┬${"─".repeat(descWidth + 2)}┐`;
  const header =
    `  │ ${chalk.hex("#50fa7b").bold("Command".padEnd(nameWidth))} ` +
    `│ ${chalk.hex("#50fa7b").bold("Description".padEnd(descWidth))} │`;
  const mid = `  ├${"─".repeat(nameWidth + 2)}┼${"─".repeat(descWidth + 2)}┤`;

  const rows = commands.map(({ name, desc }) => {
    const clipped =
      desc.length > descWidth ? `${desc.slice(0, descWidth - 1)}…` : desc;
    return (
      `  │ ${chalk.hex("#ff79c6")(name.padEnd(nameWidth))} ` +
      `│ ${chalk.hex("#f8f8f2")(clipped.padEnd(descWidth))} │`
    );
  });

  const bottom = `  └${"─".repeat(nameWidth + 2)}┴${"─".repeat(descWidth + 2)}┘`;

  return [top, header, mid, ...rows, bottom].join("\n");
}

// Customize command help colors with Dracula theme
const originalHelp = program.helpInformation.bind(program);
program.helpInformation = function () {
  const help = originalHelp();
  const commandsIndex = help.indexOf("Commands:");
  const commandsBlock =
    commandsIndex >= 0 ? help.slice(0, commandsIndex) : help;

  const styled = commandsBlock
    // Usage line - Dracula cyan
    .replace(
      /^Usage: (.+)$/gm,
      (_, usage) =>
        chalk.hex("#8be9fd").bold("Usage: ") + chalk.hex("#f8f8f2")(usage),
    )
    // Section headers - Dracula green
    .replace(/^Options:$/gm, "\n" + chalk.hex("#50fa7b").bold("Options:"))
    // Flags - Dracula purple
    .replace(/(-[a-zA-Z-]+)/g, chalk.hex("#bd93f9")("$1"))
    // Arguments - Dracula yellow
    .replace(/<([^>]+)>/g, chalk.hex("#f1fa8c")("<$1>"))
    // Optional params - Dracula comment
    .replace(/\[([^\]]+)\]/g, chalk.hex("#6272a4")("[$1]"));

  return (
    styled +
    "\n" +
    chalk.hex("#50fa7b").bold("\nCommands:") +
    "\n" +
    buildCommandTable() +
    "\n" +
    chalk.hex("#50fa7b").bold("\nQuick Examples:") +
    "\n" +
    chalk.hex("#f8f8f2")("  och auth login --url https://git.example.com") +
    "\n" +
    chalk.hex("#f8f8f2")("  och config doctor") +
    "\n" +
    chalk.hex("#f8f8f2")("  och repo push --branch main") +
    "\n" +
    chalk.hex("#f8f8f2")("  och pr create --base main --title \"feat: example\"") +
    "\n" +
    chalk.hex("#f8f8f2")("  och stack submit")
  );
};

program
  .name("och")
  .description(
    chalk.hex("#f8f8f2")("Complete Git hosting with ") + // Dracula foreground
      chalk.hex("#bd93f9").bold("stack-first PR workflows"), // Dracula purple
  )
  .version("1.1.2");

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
program.addCommand(runnerCommands);

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

// Focus command (Interactive Cockpit)
program.addCommand(focusCommand);

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
    try {
      await pushRepo(options);
    } catch {
      process.exit(1);
    }
  });

repoCommand
  .command("clone <repo>")
  .description("Clone a repository from OpenCodeHub")
  .argument("[destination]", "Local directory to clone into")
  .action(async (repo, destination) => {
    try {
      await cloneRepo(repo, destination);
    } catch {
      process.exit(1);
    }
  });

repoCommand
  .command("create <name>")
  .description("Create a new repository on OpenCodeHub")
  .option("-d, --description <desc>", "Repository description")
  .option("-p, --private", "Make repository private")
  .option("--no-init", "Don't initialize with README")
  .action(async (name, options) => {
    try {
      await createRepo({
        name,
        description: options.description,
        visibility: options.private ? "private" : "public",
        init: options.init,
      });
    } catch {
      process.exit(1);
    }
  });

repoCommand
  .command("list")
  .alias("ls")
  .description("List your repositories")
  .action(async () => {
    try {
      await listRepos();
    } catch {
      process.exit(1);
    }
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

// och push (shorthand for repo push)
program
  .command("push")
  .description("Push to OpenCodeHub (shorthand for 'repo push')")
  .option("-b, --branch <branch>", "Branch to push")
  .option("-f, --force", "Force push")
  .action(async (options) => {
    try {
      await pushRepo(options);
    } catch {
      process.exit(1);
    }
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
      console.log(
        chalk.yellow("Not a git repository. Initialize with 'git init' first."),
      );
      return;
    }

    console.log(chalk.green("✓ Repository initialized for OpenCodeHub"));
    console.log(chalk.dim("\nNext steps:"));
    console.log(chalk.dim("  1. Run 'och auth login' to authenticate"));
    console.log(
      chalk.dim("  2. Run 'och repo create <name>' to create remote"),
    );
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
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
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
        console.log(
          chalk.yellow(
            "Not a git repository. Run this command inside a git repository.",
          ),
        );
        return;
      }

      const branches = await git.branchLocal();
      const currentBranch = branches.current;
      const stackBranches = branches.all.filter((b) => b.startsWith("stack/"));

      const { renderPanel, printMetricStrip, formatBadge } = await import("../src/lib/formatter.js");

      const metrics = [
        { label: "Current Branch", value: currentBranch, tone: "info" as const },
        { label: "Stack Branches", value: stackBranches.length, tone: stackBranches.length > 0 ? "accent" as const : "muted" as const }
      ];

      console.log("");
      printMetricStrip(metrics);
      console.log("");

      const lines = [];
      
      if (stackBranches.length > 0) {
        lines.push(chalk.hex("#bd93f9").bold("Stack Branches:"));
        for (const branch of stackBranches) {
          const isCurrent = branch === currentBranch;
          const marker = isCurrent ? chalk.hex("#50fa7b")("▶") : chalk.hex("#6272a4")("•");
          lines.push(`  ${marker} ${isCurrent ? chalk.bold.hex("#f8f8f2")(branch) : chalk.hex("#6272a4")(branch)}`);
        }
        lines.push("");
      }

      // Show git status
      const status = await git.status();
      if (
        status.modified.length > 0 ||
        status.not_added.length > 0 ||
        status.staged.length > 0
      ) {
        lines.push(chalk.hex("#f1fa8c").bold("Uncommitted Changes:"));
        if (status.staged.length > 0) {
          lines.push(`  ${formatBadge(String(status.staged.length), "success")} staged`);
        }
        if (status.modified.length > 0) {
          lines.push(`  ${formatBadge(String(status.modified.length), "warning")} modified`);
        }
        if (status.not_added.length > 0) {
          lines.push(`  ${formatBadge(String(status.not_added.length), "danger")} untracked`);
        }
      } else {
        lines.push(chalk.hex("#6272a4")("Working tree clean"));
      }

      renderPanel({
        title: "Repository Status",
        lines,
        tone: "neutral"
      });

      console.log("");
    } catch (error) {
      console.error(chalk.red("\nError checking status:"));
      console.error(
        chalk.dim(error instanceof Error ? error.message : "Unknown error"),
      );
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
        headers: { Authorization: `Bearer ${config.token}` },
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
    local commands="auth stack pr issue ci queue review metrics repo branch config release search secret ssh-key api push init sync status whoami focus runner"
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
        'focus:Interactive stack and review cockpit'
        'runner:Manage OpenCodeHub CI runners'
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
complete -c och -n "__fish_use_subcommand" -a "focus" -d "Interactive stack and review cockpit"
complete -c och -n "__fish_use_subcommand" -a "runner" -d "Manage OpenCodeHub CI runners"
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
