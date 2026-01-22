/**
 * PR Commands
 * Manage pull requests from the CLI
 */

import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { simpleGit } from "simple-git";
import { getWithAuth, patchWithAuth, postWithAuth } from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";
import { getRepoInfoFromGit } from "../../lib/git.js";

const git = simpleGit();

interface PullRequest {
  id: string;
  number: number;
  title: string;
  state: string;
  author: { username: string };
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}

export const prCommands = new Command("pr").description("Manage pull requests");

// Get repo info from git remote
async function getRepoInfo() {
  return getRepoInfoFromGit(git);
}

// PR Create
prCommands
  .command("create")
  .description("Create a new pull request")
  .option("-t, --title <title>", "PR title")
  .option("-b, --body <body>", "PR description")
  .option("-B, --base <branch>", "Base branch", "main")
  .option("-d, --draft", "Create as draft PR")
  .option("-a, --assignee <user>", "Assign to user")
  .option(
    "-l, --label <label>",
    "Add label (can be used multiple times)",
    (val, acc: string[]) => [...acc, val],
    [],
  )
  .action(async (options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Preparing pull request...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const currentBranch = (
        await git.revparse(["--abbrev-ref", "HEAD"])
      ).trim();

      if (currentBranch === options.base) {
        spinner.fail(
          `Cannot create PR from ${options.base} to ${options.base}`,
        );
        process.exit(1);
      }

      spinner.stop();

      // Get title interactively if not provided
      let title = options.title;
      let body = options.body;

      if (!title) {
        const lastCommit = await git.log({ maxCount: 1 });
        const defaultTitle =
          lastCommit.latest?.message?.split("\n")[0] || currentBranch;

        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "title",
            message: "PR Title:",
            default: defaultTitle,
          },
          {
            type: "editor",
            name: "body",
            message: "PR Description (optional):",
          },
        ]);
        title = answers.title;
        body = answers.body;
      }

      spinner.start("Creating pull request...");

      const result = await postWithAuth<{ data: PullRequest }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`,
        {
          title,
          body,
          sourceBranch: currentBranch,
          targetBranch: options.base,
          isDraft: options.draft || false,
          assignee: options.assignee,
          labels: options.label,
        },
      );

      spinner.succeed(
        `Created PR #${result.data.number}: ${result.data.title}`,
      );
      console.log(
        chalk.dim(
          `  ${config.serverUrl}/${repoInfo.owner}/${repoInfo.repo}/pull/${result.data.number}`,
        ),
      );
    } catch (error) {
      spinner.fail("Failed to create pull request");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// PR List
prCommands
  .command("list")
  .alias("ls")
  .description("List pull requests")
  .option(
    "-s, --state <state>",
    "Filter by state (open, closed, merged, all)",
    "open",
  )
  .option("-a, --author <user>", "Filter by author")
  .option("-l, --label <label>", "Filter by label")
  .option("-L, --limit <n>", "Maximum results", "30")
  .action(async (options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Fetching pull requests...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const params = new URLSearchParams();
      if (options.state !== "all") params.append("state", options.state);
      if (options.author) params.append("author", options.author);
      if (options.label) params.append("label", options.label);
      params.append("limit", options.limit);

      const result = await getWithAuth<{ data: PullRequest[] }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls?${params}`,
      );

      spinner.stop();

      if (result.data.length === 0) {
        console.log(chalk.dim("No pull requests found."));
        return;
      }

      console.log(chalk.bold(`\n📋 Pull Requests (${result.data.length})\n`));

      for (const pr of result.data) {
        const stateIcon =
          pr.state === "open"
            ? chalk.green("●")
            : pr.state === "merged"
              ? chalk.magenta("●")
              : chalk.red("●");
        const draftLabel = pr.isDraft ? chalk.dim(" [draft]") : "";

        console.log(`${stateIcon} #${pr.number} ${pr.title}${draftLabel}`);
        console.log(
          chalk.dim(
            `  ${pr.sourceBranch} → ${pr.targetBranch} • @${pr.author.username}`,
          ),
        );
      }

      console.log("");
    } catch (error) {
      spinner.fail("Failed to list pull requests");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// PR View
prCommands
  .command("view <number>")
  .description("View a pull request")
  .option("-w, --web", "Open in browser")
  .action(async (number: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Fetching pull request...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const result = await getWithAuth<{
        data: PullRequest & { body?: string };
      }>(`/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}`);

      spinner.stop();

      const pr = result.data;
      const stateColor =
        pr.state === "open"
          ? chalk.green
          : pr.state === "merged"
            ? chalk.magenta
            : chalk.red;

      console.log(chalk.bold(`\n#${pr.number} ${pr.title}\n`));
      console.log(
        `State: ${stateColor(pr.state.toUpperCase())}${pr.isDraft ? chalk.dim(" (draft)") : ""}`,
      );
      console.log(`Author: @${pr.author.username}`);
      console.log(`Branch: ${pr.sourceBranch} → ${pr.targetBranch}`);
      console.log(`Created: ${new Date(pr.createdAt).toLocaleDateString()}`);

      if (pr.additions !== undefined) {
        console.log(
          `Changes: ${chalk.green(`+${pr.additions}`)} ${chalk.red(`-${pr.deletions}`)} (${pr.changedFiles} files)`,
        );
      }

      if (pr.body) {
        console.log(chalk.dim("\n─".repeat(40)));
        console.log(pr.body);
      }

      console.log(chalk.dim("\n─".repeat(40)));
      console.log(
        chalk.dim(
          `${config.serverUrl}/${repoInfo.owner}/${repoInfo.repo}/pull/${number}`,
        ),
      );
      console.log("");
    } catch (error) {
      spinner.fail("Failed to fetch pull request");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// PR Merge
prCommands
  .command("merge <number>")
  .description("Merge a pull request")
  .option("-m, --merge", "Use merge commit")
  .option("-s, --squash", "Squash and merge")
  .option("-r, --rebase", "Rebase and merge")
  .option("-d, --delete-branch", "Delete branch after merge")
  .action(async (number: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const mergeMethod = options.squash
      ? "squash"
      : options.rebase
        ? "rebase"
        : "merge";
    const spinner = ora(`Merging PR #${number} (${mergeMethod})...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      await postWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/merge`,
        {
          method: mergeMethod,
          deleteBranch: options.deleteBranch,
        },
      );

      spinner.succeed(`Merged PR #${number}`);
    } catch (error) {
      spinner.fail("Failed to merge pull request");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// PR Checkout
prCommands
  .command("checkout <number>")
  .alias("co")
  .description("Checkout a pull request locally")
  .action(async (number: string) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Checking out PR #${number}...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      // Get PR info
      const result = await getWithAuth<{ data: PullRequest }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}`,
      );

      const branchName = result.data.sourceBranch;

      // Fetch and checkout
      spinner.text = `Fetching ${branchName}...`;
      await git.fetch(["origin", branchName]);

      spinner.text = `Checking out ${branchName}...`;
      await git.checkout(branchName);

      spinner.succeed(`Checked out PR #${number} (${branchName})`);
    } catch (error) {
      spinner.fail("Failed to checkout pull request");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// PR Close
prCommands
  .command("close <number>")
  .description("Close a pull request")
  .action(async (number: string) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Closing PR #${number}...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      await patchWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}`,
        { state: "closed" },
      );

      spinner.succeed(`Closed PR #${number}`);
    } catch (error) {
      spinner.fail("Failed to close pull request");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// PR Diff
prCommands
  .command("diff <number>")
  .description("View pull request diff")
  .action(async (number: string) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Fetching diff for PR #${number}...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const result = await getWithAuth<{ data: { diff: string } }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}/diff`,
      );

      spinner.stop();
      console.log(result.data.diff);
    } catch (error) {
      spinner.fail("Failed to fetch diff");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// PR Ready (mark as ready for review)
prCommands
  .command("ready <number>")
  .description("Mark pull request as ready for review")
  .action(async (number: string) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Marking PR #${number} as ready...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      await patchWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${number}`,
        { isDraft: false },
      );

      spinner.succeed(`PR #${number} is now ready for review`);
    } catch (error) {
      spinner.fail("Failed to update pull request");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

export default prCommands;
