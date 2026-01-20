/**
 * Insights CLI Commands
 * View developer metrics and team insights
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { getWithAuth } from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";
import simpleGit from "simple-git";

const git = simpleGit();

export const insightsCommand = new Command("insights")
    .description("View developer metrics and insights");

// Helper to get repo info
async function getRepoInfo() {
    try {
        const remotes = await git.getRemotes(true);
        const origin = remotes.find((r) => r.name === "origin");
        if (!origin?.refs?.fetch) return null;

        const url = origin.refs.fetch;
        const match = url.match(/[:/]([^/]+)\/([^/.]+)/);
        if (!match) return null;

        return { owner: match[1], name: match[2] };
    } catch {
        return null;
    }
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

            const res = await getWithAuth(`/api/metrics/user?period=${options.period}`);

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
            console.log(chalk.gray(`  Period: Last ${formatPeriod(options.period)}\n`));

            // Main metrics
            const table = new Table({
                chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
            });

            table.push(
                [chalk.cyan("PRs Opened"), chalk.bold.white(metrics.prsOpened)],
                [chalk.magenta("PRs Merged"), chalk.bold.white(metrics.prsMerged)],
                [chalk.blue("Reviews Given"), chalk.bold.white(metrics.reviewsGiven)],
                [chalk.yellow("Avg Time to Merge"), chalk.bold.white(formatDuration(metrics.avgTimeToMerge))],
                [chalk.green("Merge Rate"), chalk.bold.white(
                    metrics.prsOpened > 0
                        ? `${Math.round((metrics.prsMerged / metrics.prsOpened) * 100)}%`
                        : "N/A"
                )],
            );

            console.log(table.toString());
            console.log();

            // Productivity tip
            if (metrics.prsOpened > 0 && metrics.avgTimeToMerge > 48) {
                console.log(chalk.yellow("  💡 Tip: Your PRs take an average of " +
                    formatDuration(metrics.avgTimeToMerge) + " to merge."));
                console.log(chalk.gray("     Consider smaller PRs for faster reviews.\n"));
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
                const repoRes = await getWithAuth(`/api/repos/${repoInfo.owner}/${repoInfo.name}`);
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
                console.log(chalk.bold(`\n👥 Team Metrics for ${repoInfo.owner}/${repoInfo.name}\n`));
            } else {
                console.log(chalk.bold("\n👥 Team Metrics\n"));
            }

            console.log(chalk.gray(`  Period: Last ${formatPeriod(options.period)}\n`));

            // Repository summary
            if (repoMetrics.totalPrs !== undefined) {
                console.log(`  Total PRs: ${chalk.cyan(repoMetrics.totalPrs)}`);
                console.log(`  Merged: ${chalk.green(repoMetrics.mergedPrs || 0)}`);
                console.log(`  Open: ${chalk.yellow(repoMetrics.openPrs || 0)}`);
                console.log();
            }

            // Leaderboard
            if (contributors.length > 0) {
                console.log(chalk.bold("  🏆 Top Contributors\n"));

                const table = new Table({
                    head: [
                        chalk.gray("#"),
                        chalk.gray("Developer"),
                        chalk.gray("PRs"),
                        chalk.gray("Reviews"),
                        chalk.gray("Score"),
                    ],
                });

                contributors.forEach((c: any, i: number) => {
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
                    const score = (c.prs || 0) * 2 + (c.reviews || 0);

                    table.push([
                        medal,
                        chalk.white(c.username),
                        chalk.cyan(c.prs || 0),
                        chalk.blue(c.reviews || 0),
                        chalk.yellow(score),
                    ]);
                });

                console.log(table.toString());
            } else {
                console.log(chalk.gray("  No contributor data available.\n"));
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

            const res = await getWithAuth(`/api/repos/${repoInfo.owner}/${repoInfo.name}/metrics`);

            spinner.stop();

            if (options.json) {
                console.log(JSON.stringify(res, null, 2));
                return;
            }

            const m = res.metrics || {};

            console.log(chalk.bold(`\n📈 Repository Metrics: ${repoInfo.owner}/${repoInfo.name}\n`));

            const table = new Table();
            table.push(
                [chalk.gray("Stars"), chalk.yellow(`⭐ ${m.stars || 0}`)],
                [chalk.gray("Forks"), chalk.blue(`🍴 ${m.forks || 0}`)],
                [chalk.gray("Open PRs"), chalk.green(`📝 ${m.openPrs || 0}`)],
                [chalk.gray("Open Issues"), chalk.red(`🐛 ${m.openIssues || 0}`)],
                [chalk.gray("Contributors"), chalk.cyan(`👥 ${m.contributors || 0}`)],
                [chalk.gray("Commits (30d)"), chalk.magenta(`📊 ${m.recentCommits || 0}`)],
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
