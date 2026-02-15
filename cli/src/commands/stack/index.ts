
/**
 * Stack Commands
 * Manage stacked PRs from the CLI
 */

import chalk from "chalk";
import { spawnSync } from "child_process";
import { Command } from "commander";
import fs from "fs";
import ora from "ora";
import os from "os";
import path from "path";
import { simpleGit } from "simple-git";
import { applyTlsConfig } from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";
import { getRepoInfoFromGit } from "../../lib/git.js";
import {
  setParentBranch,
  getParentBranch,
  getStackTopology,
  flattenStack,
  recursiveRebase
} from "../../lib/stack-manager.js";

const git = simpleGit();

export const stackCommands = new Command("stack").description(
  "Manage stacked PRs",
);

function createAskPassScript(): string {
  const scriptPath = path.join(
    os.tmpdir(),
    `och-askpass-${process.pid}-${Date.now()}.sh`,
  );

  const script = `#!/bin/sh
case "$1" in
*Username*) echo "$GIT_ASKPASS_USERNAME" ;;
*Password*) echo "$GIT_ASKPASS_PASSWORD" ;;
*) echo "$GIT_ASKPASS_PASSWORD" ;;
esac
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o700 });
  return scriptPath;
}

// Create a new branch in the stack
stackCommands
  .command("create <name>")
  .description("Create a new branch in the current stack")
  .option("-m, --message <message>", "Commit message for work in progress")
  .action(async (name: string, options) => {
    const spinner = ora("Creating stacked branch...").start();

    try {
      // Get current branch
      const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

      // Create new branch
      const newBranch = `stack/${name}`;
      await git.checkoutLocalBranch(newBranch);

      // Save parent metadata
      await setParentBranch(git, newBranch, currentBranch);

      spinner.succeed(
        `Created branch ${chalk.green(newBranch)} (stacked on ${chalk.cyan(currentBranch)})`,
      );

      console.log("\n" + chalk.dim("Next steps:"));
      console.log(chalk.dim("  • Make your changes"));
      console.log(
        chalk.dim("  • Run ") +
        chalk.cyan("och stack submit") +
        chalk.dim(" to push and create PRs"),
      );
    } catch (error) {
      spinner.fail("Failed to create branch");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
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
      // Get stack topology
      const roots = await getStackTopology(git);
      const allNodes = flattenStack(roots);

      // Filter for branches starting with 'stack/' or just use the topology?
      // Let's use topology but only push branches that we manage.
      // Assuming user is on a branch in the stack, we probably want to submit *this* stack.
      const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

      // Filter nodes related to current branch? existing logic submitted ALL 'stack/' branches.
      // Let's stick to submitting topologically sorted list of 'stack/' branches.
      const sortedStackBranches = allNodes
        .map(n => n.branch)
        .filter(b => b.startsWith("stack/"));

      if (sortedStackBranches.length === 0) {
        spinner.fail("No stack branches found");
        console.log(
          chalk.dim("Run ") +
          chalk.cyan("och stack create <name>") +
          chalk.dim(" to start a stack."),
        );
        process.exit(1);
      }

      const repoInfo = await getRepoInfoFromGit(git);
      if (!repoInfo) {
        spinner.fail("Could not determine repository from origin");
        process.exit(1);
      }

      const { owner, repo: repoName } = repoInfo;

      // Push all stack branches with authentication (no token in URL)
      spinner.text = "Pushing branches...";
      const pushedBranches: string[] = [];
      const repoRoot = (await git.revparse(["--show-toplevel"])).trim();
      const askPass = createAskPassScript();

      const pushEnv = {
        ...process.env,
        GIT_ASKPASS: askPass,
        GIT_ASKPASS_USERNAME: config.username || owner,
        GIT_ASKPASS_PASSWORD: config.token,
        GIT_TERMINAL_PROMPT: "0",
      };

      try {
        for (const branch of sortedStackBranches) {
          try {
            console.log(chalk.dim(`  Pushing ${branch} to origin...`));
            const result = spawnSync(
              "git",
              ["push", "origin", branch, "--force-with-lease"],
              {
                cwd: repoRoot,
                env: pushEnv,
                stdio: "pipe",
                encoding: "utf-8",
              },
            );

            if (result.status !== 0) {
              throw new Error(result.stderr || "Push failed");
            }

            pushedBranches.push(branch);
            console.log(chalk.green(`  ✓ Pushed ${branch}`));
          } catch (e) {
            console.log(
              chalk.red(
                `\n  ✗ Could not push ${branch}: ${e instanceof Error ? e.message : "Unknown error"}`,
              ),
            );
          }
        }
      } finally {
        fs.rmSync(askPass, { force: true });
      }

      spinner.text = "Creating PRs...";

      // Build branch metadata for PR creation
      const branchData = [];
      for (const branch of sortedStackBranches) {
        const name = branch.replace("stack/", "");
        const parent = await getParentBranch(git, branch) || "main";

        branchData.push({
          name: branch,
          title: options.message
            ? `${options.message}: ${name}`
            : `[Stack] ${name}`,
          description: `Part of stacked PR workflow.\n\nBranch: \`${branch}\`\nBased on: \`${parent}\``,
          parentBranch: parent,
        });
      }

      // Create PRs via API
      try {
        applyTlsConfig();
        const response = await fetch(`${config.serverUrl}/api/stacks`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.token}`,
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

        spinner.succeed(
          `Stack submitted with ${pushedBranches.length} branches`,
        );

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
        console.log(
          chalk.yellow("\n  Note: Could not auto-create PRs (API unavailable)"),
        );
        console.log(chalk.dim("  Create PRs manually at your repository\n"));
      }

      console.log(chalk.dim("\nNext steps:"));
      console.log(chalk.dim("  • Get reviews on your PRs"));
      console.log(
        chalk.dim("  • Run ") +
        chalk.cyan("och stack sync") +
        chalk.dim(" to keep in sync"),
      );
    } catch (error) {
      spinner.fail("Failed to submit stack");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// View current stack
stackCommands
  .command("log")
  .alias("ls")
  .alias("view")
  .description("Visual stack graph")
  .action(async () => {
    try {
      const roots = await getStackTopology(git);

      console.log(chalk.bold("\n📚 Stack Topology\n"));

      if (roots.length === 0) {
        console.log(chalk.dim("No stack found."));
        return;
      }

      const printNode = (node: any, prefix: string, isLast: boolean, isRoot: boolean) => {
        const marker = isRoot ? "" : (isLast ? "└─" : "├─");
        const branchColor = node.isCurrent ? chalk.green.bold : chalk.cyan;
        const status = node.isCurrent ? chalk.yellow(" (current)") : "";

        console.log(`${prefix}${marker} ${branchColor(node.branch)}${status}`);

        const newPrefix = isRoot ? "" : (prefix + (isLast ? "   " : "│  "));

        for (let i = 0; i < node.children.length; i++) {
          printNode(node.children[i], newPrefix, i === node.children.length - 1, false);
        }
      };

      for (const root of roots) {
        // If root has children or is interesting (e.g. main)
        if (root.children.length > 0 || root.branch === 'main') {
          printNode(root, "", true, true);
          console.log("");
        }
      }

    } catch (error) {
      console.error(chalk.red("Failed to view stack"), error);
      process.exit(1);
    }
  });

// Sync stack (Recursive Rebase)
stackCommands
  .command("sync")
  .description("Recursively rebase stack on updated main")
  .action(async () => {
    const spinner = ora("Syncing stack...").start();

    try {
      // 1. Update main
      spinner.text = "Fetching origin/main...";
      await git.fetch();
      try {
        await git.checkout("main");
        await git.pull();
      } catch (e) {
        // Maybe main doesn't exist locally or something
      }

      // 2. Refresh topology
      const roots = await getStackTopology(git);
      const flatStack = flattenStack(roots);

      // Filter out main itself from loop
      const stackBranches = flatStack.filter(n => n.branch !== 'main');

      if (stackBranches.length === 0) {
        spinner.info("No stack branches to sync.");
        return;
      }

      let syncedCount = 0;

      // 3. Recursive Rebase
      // We iterate breadth-first or topologically (flattenStack is DFS preorder usually, which ensures parents processed before children)
      // Actually flattenStack implementation above is DFS preorder. Parent -> Child -> ...
      for (const node of stackBranches) {
        const parentBranch = node.parent;
        if (!parentBranch) continue;

        spinner.text = `Rebasing ${node.branch} onto ${parentBranch}...`;

        try {
          // We rebase 'node.branch' onto 'parentBranch'
          // Since we processed 'parentBranch' already (if it was in stack), 'parentBranch' tip is updated.
          // So 'git rebase parentBranch' works perfectly.
          await git.checkout(node.branch);
          await git.rebase([parentBranch]);
          syncedCount++;
        } catch (e) {
          spinner.fail(`Conflict rebasing ${node.branch} onto ${parentBranch}`);
          console.log(chalk.yellow("\nResolve conflicts manually, then continue with:"));
          console.log(chalk.cyan(`  git rebase --continue`));
          // We have to stop here because children depend on this
          process.exit(1);
        }
      }

      // 4. Force Push updates (Optional, or explicit?)
      // Graphite defaults to not pushing unless requested or 'gt submit'.
      // But 'och stack sync' implies syncing WITH remote often.
      // Let's keep it local only for safety, user updates remote via 'och stack submit'.

      spinner.succeed(`Recursively rebased ${syncedCount} branches. Run 'och stack submit' to push updates.`);

    } catch (error) {
      spinner.fail("Failed to sync stack");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

export default stackCommands;
