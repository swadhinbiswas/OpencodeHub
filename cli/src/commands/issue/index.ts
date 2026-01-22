/**
 * Issue Commands
 * Manage issues from the CLI
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

interface Issue {
  id: string;
  number: number;
  title: string;
  state: string;
  author: { username: string };
  createdAt: string;
  updatedAt: string;
  labels?: { name: string; color: string }[];
  assignees?: { username: string }[];
  milestone?: { title: string };
}

export const issueCommands = new Command("issue").description("Manage issues");

// Get repo info from git remote
async function getRepoInfo() {
  return getRepoInfoFromGit(git);
}

// Issue Create
issueCommands
  .command("create")
  .description("Create a new issue")
  .option("-t, --title <title>", "Issue title")
  .option("-b, --body <body>", "Issue description")
  .option("-a, --assignee <user>", "Assign to user")
  .option(
    "-l, --label <label>",
    "Add label",
    (val, acc: string[]) => [...acc, val],
    [],
  )
  .option("-m, --milestone <name>", "Add to milestone")
  .action(async (options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        console.error(chalk.red("Could not determine repository"));
        process.exit(1);
      }

      let title = options.title;
      let body = options.body;

      if (!title) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "title",
            message: "Issue Title:",
            validate: (input) => input.length > 0 || "Title is required",
          },
          {
            type: "editor",
            name: "body",
            message: "Issue Description (optional):",
          },
        ]);
        title = answers.title;
        body = answers.body;
      }

      const spinner = ora("Creating issue...").start();

      const result = await postWithAuth<{ data: Issue }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/issues`,
        {
          title,
          body,
          assignee: options.assignee,
          labels: options.label,
          milestone: options.milestone,
        },
      );

      spinner.succeed(
        `Created issue #${result.data.number}: ${result.data.title}`,
      );
      console.log(
        chalk.dim(
          `  ${config.serverUrl}/${repoInfo.owner}/${repoInfo.repo}/issues/${result.data.number}`,
        ),
      );
    } catch (error) {
      console.error(chalk.red("Failed to create issue"));
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Issue List
issueCommands
  .command("list")
  .alias("ls")
  .description("List issues")
  .option("-s, --state <state>", "Filter by state (open, closed, all)", "open")
  .option("-a, --author <user>", "Filter by author")
  .option("-A, --assignee <user>", "Filter by assignee")
  .option("-l, --label <label>", "Filter by label")
  .option("-m, --milestone <name>", "Filter by milestone")
  .option("-L, --limit <n>", "Maximum results", "30")
  .action(async (options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Fetching issues...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const params = new URLSearchParams();
      if (options.state !== "all") params.append("state", options.state);
      if (options.author) params.append("author", options.author);
      if (options.assignee) params.append("assignee", options.assignee);
      if (options.label) params.append("label", options.label);
      if (options.milestone) params.append("milestone", options.milestone);
      params.append("limit", options.limit);

      const result = await getWithAuth<{ data: Issue[] }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/issues?${params}`,
      );

      spinner.stop();

      if (result.data.length === 0) {
        console.log(chalk.dim("No issues found."));
        return;
      }

      console.log(chalk.bold(`\n📋 Issues (${result.data.length})\n`));

      for (const issue of result.data) {
        const stateIcon =
          issue.state === "open" ? chalk.green("●") : chalk.red("●");
        const labels =
          issue.labels
            ?.map((l) => chalk.hex(l.color || "#888")(l.name))
            .join(" ") || "";

        console.log(`${stateIcon} #${issue.number} ${issue.title} ${labels}`);
        console.log(
          chalk.dim(
            `  @${issue.author.username} • ${new Date(issue.createdAt).toLocaleDateString()}`,
          ),
        );
      }

      console.log("");
    } catch (error) {
      spinner.fail("Failed to list issues");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Issue View
issueCommands
  .command("view <number>")
  .description("View an issue")
  .option("-c, --comments", "Show comments")
  .action(async (number: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Fetching issue...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const result = await getWithAuth<{ data: Issue & { body?: string } }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${number}`,
      );

      spinner.stop();

      const issue = result.data;
      const stateColor = issue.state === "open" ? chalk.green : chalk.red;

      console.log(chalk.bold(`\n#${issue.number} ${issue.title}\n`));
      console.log(`State: ${stateColor(issue.state.toUpperCase())}`);
      console.log(`Author: @${issue.author.username}`);
      console.log(`Created: ${new Date(issue.createdAt).toLocaleDateString()}`);

      if (issue.labels && issue.labels.length > 0) {
        const labels = issue.labels
          .map((l) => chalk.hex(l.color || "#888")(l.name))
          .join(", ");
        console.log(`Labels: ${labels}`);
      }

      if (issue.assignees && issue.assignees.length > 0) {
        const assignees = issue.assignees
          .map((a) => `@${a.username}`)
          .join(", ");
        console.log(`Assignees: ${assignees}`);
      }

      if (issue.milestone) {
        console.log(`Milestone: ${issue.milestone.title}`);
      }

      if (result.data.body) {
        console.log(chalk.dim("\n─".repeat(40)));
        console.log(result.data.body);
      }

      console.log(chalk.dim("\n─".repeat(40)));
      console.log(
        chalk.dim(
          `${config.serverUrl}/${repoInfo.owner}/${repoInfo.repo}/issues/${number}`,
        ),
      );
      console.log("");
    } catch (error) {
      spinner.fail("Failed to fetch issue");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Issue Close
issueCommands
  .command("close <number>")
  .description("Close an issue")
  .option("-c, --comment <comment>", "Add a closing comment")
  .action(async (number: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Closing issue #${number}...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      if (options.comment) {
        await postWithAuth(
          `/api/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${number}/comments`,
          { body: options.comment },
        );
      }

      await patchWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${number}`,
        { state: "closed" },
      );

      spinner.succeed(`Closed issue #${number}`);
    } catch (error) {
      spinner.fail("Failed to close issue");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Issue Reopen
issueCommands
  .command("reopen <number>")
  .description("Reopen an issue")
  .action(async (number: string) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Reopening issue #${number}...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      await patchWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${number}`,
        { state: "open" },
      );

      spinner.succeed(`Reopened issue #${number}`);
    } catch (error) {
      spinner.fail("Failed to reopen issue");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Issue Comment
issueCommands
  .command("comment <number>")
  .description("Add a comment to an issue")
  .option("-b, --body <body>", "Comment body")
  .action(async (number: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        console.error(chalk.red("Could not determine repository"));
        process.exit(1);
      }

      let body = options.body;

      if (!body) {
        const answers = await inquirer.prompt([
          {
            type: "editor",
            name: "body",
            message: "Comment:",
          },
        ]);
        body = answers.body;
      }

      if (!body || body.trim() === "") {
        console.error(chalk.red("Comment cannot be empty"));
        process.exit(1);
      }

      const spinner = ora("Adding comment...").start();

      await postWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${number}/comments`,
        { body },
      );

      spinner.succeed(`Added comment to issue #${number}`);
    } catch (error) {
      console.error(chalk.red("Failed to add comment"));
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

export default issueCommands;
