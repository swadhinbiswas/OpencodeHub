/**
 * Review Commands
 * Manage code reviews from the CLI
 */

import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { simpleGit } from "simple-git";
import { getWithAuth, postWithAuth } from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";
import { getRepoInfoFromGit } from "../../lib/git.js";

const git = simpleGit();

interface AIReview {
  id: string;
  status: string;
  summary?: string;
  overallSeverity?: string;
  tokensUsed?: number;
  createdAt: string;
  completedAt?: string;
  suggestions?: AIReviewSuggestion[];
}

interface AIReviewSuggestion {
  id: string;
  path: string;
  line?: number;
  severity: string;
  type: string;
  title: string;
  message: string;
  suggestedFix?: string;
}

export const reviewCommands = new Command("review").description(
  "Manage code reviews",
);

// Get repo info from git remote
async function getRepoInfo() {
  return getRepoInfoFromGit(git);
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case "critical":
      return chalk.red("🔴");
    case "error":
      return chalk.red("⛔");
    case "warning":
      return chalk.yellow("⚠️");
    case "info":
      return chalk.blue("ℹ️");
    default:
      return chalk.dim("○");
  }
}

// Review AI - Trigger AI review
reviewCommands
  .command("ai <pr-number>")
  .description("Trigger AI code review for a pull request")
  .option("--wait", "Wait for review to complete")
  .action(async (prNumber: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Triggering AI review for PR #${prNumber}...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const result = await postWithAuth<{ data: AIReview }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}/ai-review`,
        {},
      );

      if (options.wait) {
        spinner.text = "Waiting for AI review to complete...";

        let review = result.data;
        while (review.status === "pending" || review.status === "running") {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const statusResult = await getWithAuth<{ data: AIReview }>(
            `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}/ai-review/latest`,
          );
          review = statusResult.data;
        }

        spinner.stop();
        displayReview(review);
      } else {
        spinner.succeed(`AI review triggered for PR #${prNumber}`);
        console.log(
          chalk.dim(
            "  Run 'och review status " + prNumber + "' to check progress",
          ),
        );
      }
    } catch (error) {
      spinner.fail("Failed to trigger AI review");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Review Status - Check AI review status
reviewCommands
  .command("status <pr-number>")
  .description("Check AI review status for a pull request")
  .action(async (prNumber: string) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(
      `Fetching review status for PR #${prNumber}...`,
    ).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const result = await getWithAuth<{ data: AIReview }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}/ai-review/latest`,
      );

      spinner.stop();
      displayReview(result.data);
    } catch (error) {
      spinner.fail("Failed to fetch review status");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

function displayReview(review: AIReview) {
  console.log(chalk.bold("\n🤖 AI Review\n"));
  console.log(`Status: ${review.status}`);

  if (review.overallSeverity) {
    console.log(
      `Severity: ${getSeverityIcon(review.overallSeverity)} ${review.overallSeverity}`,
    );
  }

  if (review.summary) {
    console.log(chalk.dim("\n─".repeat(40)));
    console.log(chalk.bold("Summary:"));
    console.log(review.summary);
  }

  if (review.suggestions && review.suggestions.length > 0) {
    console.log(chalk.dim("\n─".repeat(40)));
    console.log(chalk.bold(`\nSuggestions (${review.suggestions.length}):\n`));

    for (const suggestion of review.suggestions) {
      const icon = getSeverityIcon(suggestion.severity);
      console.log(`${icon} ${chalk.bold(suggestion.title)}`);
      console.log(
        chalk.dim(
          `  ${suggestion.path}${suggestion.line ? `:${suggestion.line}` : ""}`,
        ),
      );
      console.log(`  ${suggestion.message}`);
      if (suggestion.suggestedFix) {
        console.log(chalk.green(`  Fix: ${suggestion.suggestedFix}`));
      }
      console.log("");
    }
  }

  if (review.tokensUsed) {
    console.log(chalk.dim(`Tokens used: ${review.tokensUsed}`));
  }
}

// Review Approve
reviewCommands
  .command("approve <pr-number>")
  .description("Approve a pull request")
  .option("-b, --body <body>", "Review comment")
  .action(async (prNumber: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Approving PR #${prNumber}...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      await postWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}/reviews`,
        {
          event: "approve",
          body: options.body,
        },
      );

      spinner.succeed(`Approved PR #${prNumber}`);
    } catch (error) {
      spinner.fail("Failed to approve pull request");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Review Request Changes
reviewCommands
  .command("request-changes <pr-number>")
  .description("Request changes on a pull request")
  .option("-b, --body <body>", "Review comment")
  .action(async (prNumber: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    let body = options.body;

    if (!body) {
      const answers = await inquirer.prompt([
        {
          type: "editor",
          name: "body",
          message: "Review comment (explain what changes are needed):",
        },
      ]);
      body = answers.body;
    }

    if (!body || body.trim() === "") {
      console.error(chalk.red("A comment is required when requesting changes"));
      process.exit(1);
    }

    const spinner = ora(`Requesting changes on PR #${prNumber}...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      await postWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}/reviews`,
        {
          event: "request_changes",
          body,
        },
      );

      spinner.succeed(`Requested changes on PR #${prNumber}`);
    } catch (error) {
      spinner.fail("Failed to request changes");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Review Comment
reviewCommands
  .command("comment <pr-number>")
  .description("Add a review comment to a pull request")
  .option("-b, --body <body>", "Comment body")
  .action(async (prNumber: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    let body = options.body;

    if (!body) {
      const answers = await inquirer.prompt([
        {
          type: "editor",
          name: "body",
          message: "Review comment:",
        },
      ]);
      body = answers.body;
    }

    if (!body || body.trim() === "") {
      console.error(chalk.red("Comment cannot be empty"));
      process.exit(1);
    }

    const spinner = ora(`Adding comment to PR #${prNumber}...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      await postWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}/reviews`,
        {
          event: "comment",
          body,
        },
      );

      spinner.succeed(`Added comment to PR #${prNumber}`);
    } catch (error) {
      spinner.fail("Failed to add comment");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

export default reviewCommands;
