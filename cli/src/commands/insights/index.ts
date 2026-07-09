/**
 * Insights CLI Commands
 * View developer metrics and team insights
 */

import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";
import ora from "ora";
import simpleGit from "simple-git";
import { getWithAuth } from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";
import { getRepoInfoFromGit } from "../../lib/git.js";

const git = simpleGit();

export const insightsCommand = new Command("insights").description(
  "View developer metrics and insights",
);

// Helper to get repo info
async function getRepoInfo() {
  const repoInfo = await getRepoInfoFromGit(git);
  return repoInfo ? { owner: repoInfo.owner, name: repoInfo.repo } : null;
}

// Show personal metrics
insightsCommand
  .command("show")
  .description("Show your developer metrics")
  .option("-p, --period <period>", "Time period: 1w, 4w, 3m, 1y", "4w")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Loading metrics...").start();

    try {
      const config = getConfig();
      if (!config.token) {
        spinner.fail("Not authenticated. Run 'och auth login' first.");
        process.exit(1);
      }

      const res = await getWithAuth(
        `/api/user/metrics?period=${options.period}`,
      );

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }

      const metrics = res.metrics || {
        prsOpened: 0,
        prsMerged: 0,
        reviewsGiven: 0,
        avgTimeToMerge: 0,
        avgReviewTime: 0,
      };

      console.log(chalk.bold("\n📊 Your Developer Metrics\n"));
      console.log(
        chalk.hex("#6272a4")(`  Period: Last ${formatPeriod(options.period)}\n`),
      );

      // Main metrics
      const table = new Table({
        chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
      });

      table.push(
        [chalk.hex("#8be9fd")("PRs Opened"), chalk.bold.white(metrics.prsOpened)],
        [chalk.hex("#ff79c6")("PRs Merged"), chalk.bold.white(metrics.prsMerged)],
        [chalk.blue("Reviews Given"), chalk.bold.white(metrics.reviewsGiven)],
        [
          chalk.hex("#f1fa8c")("Avg Time to Merge"),
          chalk.bold.white(formatDuration(metrics.avgTimeToMerge)),
        ],
        [
          chalk.hex("#50fa7b")("Merge Rate"),
          chalk.bold.white(
            metrics.prsOpened > 0
              ? `${Math.round((metrics.prsMerged / metrics.prsOpened) * 100)}%`
              : "N/A",
          ),
        ],
      );

      console.log(table.toString());
      console.log();

      // Productivity tip
      if (metrics.prsOpened > 0 && metrics.avgTimeToMerge > 48) {
        console.log(
          chalk.hex("#f1fa8c")(
            "  💡 Tip: Your PRs take an average of " +
              formatDuration(metrics.avgTimeToMerge) +
              " to merge.",
          ),
        );
        console.log(
          chalk.hex("#6272a4")("     Consider smaller PRs for faster reviews.\n"),
        );
      }
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

// Show team metrics
insightsCommand
  .command("team")
  .description("Show team/repository metrics and leaderboard")
  .option("-p, --period <period>", "Time period: 1w, 4w, 3m, 1y", "4w")
  .option("-n, --limit <n>", "Number of top contributors", "10")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Loading team metrics...").start();

    try {
      const config = getConfig();
      if (!config.token) {
        spinner.fail("Not authenticated. Run 'och auth login' first.");
        process.exit(1);
      }

      const repoInfo = await getRepoInfo();
      let endpoint = `/api/metrics/team?period=${options.period}&limit=${options.limit}`;

      if (repoInfo) {
        const repoRes = await getWithAuth(
          `/api/repos/${repoInfo.owner}/${repoInfo.name}`,
        );
        if (repoRes.repository?.id) {
          endpoint += `&repositoryId=${repoRes.repository.id}`;
        }
      }

      const res = await getWithAuth(endpoint);

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }

      const contributors = res.contributors || [];
      const repoMetrics = res.metrics || {};

      if (repoInfo) {
        console.log(
          chalk.bold(
            `\n👥 Team Metrics for ${repoInfo.owner}/${repoInfo.name}\n`,
          ),
        );
      } else {
        console.log(chalk.bold("\n👥 Team Metrics\n"));
      }

      console.log(
        chalk.hex("#6272a4")(`  Period: Last ${formatPeriod(options.period)}\n`),
      );

      // Repository summary
      if (repoMetrics.totalPrs !== undefined) {
        console.log(`  Total PRs: ${chalk.hex("#8be9fd")(repoMetrics.totalPrs)}`);
        console.log(`  Merged: ${chalk.hex("#50fa7b")(repoMetrics.mergedPrs || 0)}`);
        console.log(`  Open: ${chalk.hex("#f1fa8c")(repoMetrics.openPrs || 0)}`);
        console.log();
      }

      // Leaderboard
      if (contributors.length > 0) {
        console.log(chalk.bold("  🏆 Top Contributors\n"));

        const table = new Table({
          head: [
            chalk.hex("#6272a4")("#"),
            chalk.hex("#6272a4")("Developer"),
            chalk.hex("#6272a4")("PRs"),
            chalk.hex("#6272a4")("Reviews"),
            chalk.hex("#6272a4")("Score"),
          ],
        });

        contributors.forEach((c: any, i: number) => {
          const medal =
            i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
          const score = (c.prs || 0) * 2 + (c.reviews || 0);

          table.push([
            medal,
            chalk.white(c.username),
            chalk.hex("#8be9fd")(c.prs || 0),
            chalk.blue(c.reviews || 0),
            chalk.hex("#f1fa8c")(score),
          ]);
        });

        console.log(table.toString());
      } else {
        console.log(chalk.hex("#6272a4")("  No contributor data available.\n"));
      }

      console.log();
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

// Repository metrics
insightsCommand
  .command("repo")
  .description("Show current repository metrics")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Loading repository metrics...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Not in a git repository");
        process.exit(1);
      }

      const res = await getWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.name}/metrics`,
      );

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }

      const m = res.metrics || {};

      console.log(
        chalk.bold(
          `\n📈 Repository Metrics: ${repoInfo.owner}/${repoInfo.name}\n`,
        ),
      );

      const table = new Table();
      table.push(
        [chalk.hex("#6272a4")("Stars"), chalk.hex("#f1fa8c")(`⭐ ${m.stars || 0}`)],
        [chalk.hex("#6272a4")("Forks"), chalk.blue(`🍴 ${m.forks || 0}`)],
        [chalk.hex("#6272a4")("Open PRs"), chalk.hex("#50fa7b")(`📝 ${m.openPrs || 0}`)],
        [chalk.hex("#6272a4")("Open Issues"), chalk.hex("#ff5555")(`🐛 ${m.openIssues || 0}`)],
        [chalk.hex("#6272a4")("Contributors"), chalk.hex("#8be9fd")(`👥 ${m.contributors || 0}`)],
        [
          chalk.hex("#6272a4")("Commits (30d)"),
          chalk.hex("#ff79c6")(`📊 ${m.recentCommits || 0}`),
        ],
      );

      console.log(table.toString());
      console.log();
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

function formatPeriod(period: string): string {
  const labels: Record<string, string> = {
    "1w": "1 week",
    "4w": "4 weeks",
    "3m": "3 months",
    "1y": "1 year",
  };
  return labels[period] || period;
}

function formatDuration(hours: number): string {
  if (!hours || hours === 0) return "N/A";
  if (hours < 1) return "< 1h";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export default insightsCommand;
