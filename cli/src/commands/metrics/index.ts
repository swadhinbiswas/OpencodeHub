/**
 * Metrics Commands
 * View developer metrics from the CLI
 */

import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { simpleGit } from "simple-git";
import { getWithAuth } from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";
import { getRepoInfoFromGit } from "../../lib/git.js";

const git = simpleGit();

interface UserMetrics {
  authored: {
    total: number;
    merged: number;
    avgTimeToMerge: number;
  };
  reviewed: {
    total: number;
    approvals: number;
    changesRequested: number;
  };
  trends: Array<{
    week: string;
    authored: number;
    reviewed: number;
  }>;
}

interface RepoMetrics {
  period: string;
  prsOpened: number;
  prsMerged: number;
  avgTimeToFirstReview: number;
  avgTimeToMerge: number;
  avgReviewRounds: number;
  topAuthors: Array<{ username: string; prCount: number }>;
  topReviewers: Array<{ username: string; reviewCount: number }>;
}

export const metricsCommands = new Command("metrics").description(
  "View developer metrics",
);

// Get repo info from git remote
async function getRepoInfo() {
  return getRepoInfoFromGit(git);
}

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function progressBar(value: number, max: number, width: number = 20): string {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return chalk.green("━".repeat(filled)) + chalk.dim("━".repeat(empty));
}

// Metrics Show
metricsCommands
  .command("show")
  .description("Show metrics")
  .option("-u, --user <username>", "Show metrics for specific user")
  .option("-r, --repo", "Show repository metrics")
  .option("-w, --weeks <n>", "Number of weeks to show", "4")
  .action(async (options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Fetching metrics...").start();

    try {
      if (options.repo) {
        // Repository metrics
        const repoInfo = await getRepoInfo();
        if (!repoInfo) {
          spinner.fail("Could not determine repository");
          process.exit(1);
        }

        const result = await getWithAuth<{ data: RepoMetrics[] }>(
          `/api/repos/${repoInfo.owner}/${repoInfo.repo}/metrics?weeks=${options.weeks}`,
        );

        spinner.stop();
        displayRepoMetrics(result.data, `${repoInfo.owner}/${repoInfo.repo}`);
      } else {
        // User metrics
        const endpoint = options.user
          ? `/api/users/${options.user}/metrics?weeks=${options.weeks}`
          : `/api/user/metrics?weeks=${options.weeks}`;

        const result = await getWithAuth<{ data: UserMetrics }>(endpoint);

        spinner.stop();
        displayUserMetrics(result.data, options.user || "You");
      }
    } catch (error) {
      spinner.fail("Failed to fetch metrics");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

function displayUserMetrics(metrics: UserMetrics, username: string) {
  console.log(chalk.bold(`\n📊 Metrics for ${username}\n`));

  // Authored PRs
  console.log(chalk.bold("PRs Authored"));
  console.log(`  Total:     ${metrics.authored.total}`);
  console.log(`  Merged:    ${metrics.authored.merged}`);
  console.log(
    `  Avg Merge: ${formatDuration(metrics.authored.avgTimeToMerge)}`,
  );

  // Reviews
  console.log(chalk.bold("\nReviews Given"));
  console.log(`  Total:             ${metrics.reviewed.total}`);
  console.log(`  Approvals:         ${metrics.reviewed.approvals}`);
  console.log(`  Changes Requested: ${metrics.reviewed.changesRequested}`);

  // Trends
  if (metrics.trends && metrics.trends.length > 0) {
    console.log(chalk.bold("\nWeekly Trend"));
    const maxAuthored = Math.max(...metrics.trends.map((t) => t.authored), 1);
    const maxReviewed = Math.max(...metrics.trends.map((t) => t.reviewed), 1);

    for (const week of metrics.trends) {
      console.log(chalk.dim(`  ${week.week}`));
      console.log(
        `    Authored: ${progressBar(week.authored, maxAuthored)} ${week.authored}`,
      );
      console.log(
        `    Reviewed: ${progressBar(week.reviewed, maxReviewed)} ${week.reviewed}`,
      );
    }
  }

  console.log("");
}

function displayRepoMetrics(metrics: RepoMetrics[], repoName: string) {
  console.log(chalk.bold(`\n📊 Metrics for ${repoName}\n`));

  if (metrics.length === 0) {
    console.log(chalk.dim("No metrics data available."));
    return;
  }

  const latest = metrics[0];

  // PR Activity
  console.log(chalk.bold("PR Activity (Latest Period)"));
  console.log(`  PRs Opened:  ${latest.prsOpened}`);
  console.log(`  PRs Merged:  ${latest.prsMerged}`);
  console.log(
    `  Avg First Review: ${formatDuration(latest.avgTimeToFirstReview)}`,
  );
  console.log(`  Avg Time to Merge: ${formatDuration(latest.avgTimeToMerge)}`);
  console.log(`  Avg Review Rounds: ${latest.avgReviewRounds.toFixed(1)}`);

  // Top Authors
  if (latest.topAuthors && latest.topAuthors.length > 0) {
    console.log(chalk.bold("\nTop Authors"));
    const maxPRs = Math.max(...latest.topAuthors.map((a) => a.prCount), 1);
    for (const author of latest.topAuthors.slice(0, 5)) {
      console.log(
        `  @${author.username.padEnd(15)} ${progressBar(author.prCount, maxPRs, 15)} ${author.prCount}`,
      );
    }
  }

  // Top Reviewers
  if (latest.topReviewers && latest.topReviewers.length > 0) {
    console.log(chalk.bold("\nTop Reviewers"));
    const maxReviews = Math.max(
      ...latest.topReviewers.map((r) => r.reviewCount),
      1,
    );
    for (const reviewer of latest.topReviewers.slice(0, 5)) {
      console.log(
        `  @${reviewer.username.padEnd(15)} ${progressBar(reviewer.reviewCount, maxReviews, 15)} ${reviewer.reviewCount}`,
      );
    }
  }

  // Trends
  if (metrics.length > 1) {
    console.log(chalk.bold("\nWeekly Trend"));
    const maxMerged = Math.max(...metrics.map((m) => m.prsMerged), 1);
    for (const week of metrics.slice(0, 4)) {
      console.log(
        `  ${week.period}: ${progressBar(week.prsMerged, maxMerged)} ${week.prsMerged} merged`,
      );
    }
  }

  console.log("");
}

export default metricsCommands;
