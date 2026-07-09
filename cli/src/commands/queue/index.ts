/**
 * Queue Commands
 * Manage merge queue from the CLI
 */

import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { simpleGit } from "simple-git";
import { deleteWithAuth, getWithAuth, postWithAuth } from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";
import { getRepoInfoFromGit } from "../../lib/git.js";

const git = simpleGit();

interface QueueItem {
  id: string;
  position: number;
  status: string;
  priority: number;
  pullRequest: {
    number: number;
    title: string;
    sourceBranch: string;
    targetBranch: string;
    author: { username: string };
  };
  addedAt: string;
  estimatedMergeTime?: string;
}

export const queueCommands = new Command("queue").description(
  "Manage merge queue",
);

// Get repo info from git remote
async function getRepoInfo() {
  return getRepoInfoFromGit(git);
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "pending":
      return chalk.hex("#f1fa8c")("◷");
    case "running_ci":
      return chalk.blue("●");
    case "ready":
      return chalk.hex("#50fa7b")("✓");
    case "merging":
      return chalk.hex("#ff79c6")("↻");
    case "failed":
      return chalk.hex("#ff5555")("✗");
    default:
      return chalk.hex("#6272a4")("○");
  }
}

// Queue Add
queueCommands
  .command("add <pr-number>")
  .description("Add a pull request to the merge queue")
  .option("-p, --priority <n>", "Priority (higher = sooner)", "0")
  .option(
    "-m, --method <method>",
    "Merge method (merge, squash, rebase)",
    "merge",
  )
  .action(async (prNumber: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.hex("#ff5555")("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Adding PR #${prNumber} to merge queue...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const result = await postWithAuth<{ data: QueueItem }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/queue`,
        {
          pullRequestNumber: parseInt(prNumber),
          priority: parseInt(options.priority),
          mergeMethod: options.method,
        },
      );

      spinner.succeed(
        `Added PR #${prNumber} to merge queue at position ${result.data.position}`,
      );

      if (result.data.estimatedMergeTime) {
        const eta = new Date(result.data.estimatedMergeTime);
        console.log(
          chalk.hex("#6272a4")(`  Estimated merge: ${eta.toLocaleTimeString()}`),
        );
      }
    } catch (error) {
      spinner.fail("Failed to add to merge queue");
      console.error(
        chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Queue List
queueCommands
  .command("list")
  .alias("ls")
  .description("List merge queue items")
  .action(async () => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.hex("#ff5555")("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Fetching merge queue...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const result = await getWithAuth<{ data: QueueItem[] }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/queue`,
      );

      spinner.stop();

      if (result.data.length === 0) {
        console.log(chalk.hex("#6272a4")("Merge queue is empty."));
        return;
      }

      console.log(
        chalk.bold(`\n🔀 Merge Queue (${result.data.length} items)\n`),
      );
      console.log(
        chalk.hex("#6272a4")("  Pos  PR      Title                              Status"),
      );
      console.log(
        chalk.hex("#6272a4")("  ───  ──      ─────                              ──────"),
      );

      for (const item of result.data) {
        const icon = getStatusIcon(item.status);
        const pr = item.pullRequest;
        const title =
          pr.title.length > 35
            ? pr.title.slice(0, 32) + "..."
            : pr.title.padEnd(35);

        console.log(
          `  ${String(item.position).padStart(3)}  #${String(pr.number).padEnd(5)} ${title} ${icon} ${item.status}`,
        );
      }

      console.log("");
    } catch (error) {
      spinner.fail("Failed to fetch merge queue");
      console.error(
        chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Queue Remove
queueCommands
  .command("remove <pr-number>")
  .alias("rm")
  .description("Remove a pull request from the merge queue")
  .action(async (prNumber: string) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.hex("#ff5555")("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Removing PR #${prNumber} from merge queue...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      await deleteWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/queue/${prNumber}`,
      );

      spinner.succeed(`Removed PR #${prNumber} from merge queue`);
    } catch (error) {
      spinner.fail("Failed to remove from merge queue");
      console.error(
        chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Queue Status
queueCommands
  .command("status")
  .description("Show merge queue status for current PR")
  .action(async () => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.hex("#ff5555")("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Checking queue status...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const currentBranch = (
        await git.revparse(["--abbrev-ref", "HEAD"])
      ).trim();

      // Find PR for current branch
      const prs = await getWithAuth<{ data: { number: number }[] }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls?sourceBranch=${currentBranch}&state=open&limit=1`,
      );

      if (prs.data.length === 0) {
        spinner.info(`No open PR found for branch ${currentBranch}`);
        return;
      }

      const prNumber = prs.data[0].number;

      // Get queue status
      const result = await getWithAuth<{ data: QueueItem[] }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/queue`,
      );

      spinner.stop();

      const item = result.data.find((i) => i.pullRequest.number === prNumber);

      if (!item) {
        console.log(chalk.hex("#6272a4")(`PR #${prNumber} is not in the merge queue.`));
        console.log(chalk.hex("#6272a4")(`Run 'och queue add ${prNumber}' to add it.`));
        return;
      }

      const icon = getStatusIcon(item.status);
      console.log(
        `\n${icon} PR #${prNumber} is at position ${item.position} in the queue`,
      );
      console.log(`Status: ${item.status}`);

      if (item.estimatedMergeTime) {
        const eta = new Date(item.estimatedMergeTime);
        console.log(`Estimated merge: ${eta.toLocaleString()}`);
      }

      console.log("");
    } catch (error) {
      spinner.fail("Failed to check queue status");
      console.error(
        chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

export default queueCommands;
