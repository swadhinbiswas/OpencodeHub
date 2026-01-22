/**
 * CI Commands
 * Manage CI/CD pipelines from the CLI
 */

import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { simpleGit } from "simple-git";
import { getWithAuth, postWithAuth } from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";
import { getRepoInfoFromGit } from "../../lib/git.js";

const git = simpleGit();

interface PipelineRun {
  id: string;
  number: number;
  status: string;
  conclusion?: string;
  branch: string;
  commit: string;
  event: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  jobs?: PipelineJob[];
}

interface PipelineJob {
  id: string;
  name: string;
  status: string;
  conclusion?: string;
  startedAt?: string;
  completedAt?: string;
}

export const ciCommands = new Command("ci").description(
  "Manage CI/CD pipelines",
);

// Get repo info from git remote
async function getRepoInfo() {
  return getRepoInfoFromGit(git);
}

function getStatusIcon(status: string, conclusion?: string): string {
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return chalk.green("✓");
      case "failure":
        return chalk.red("✗");
      case "cancelled":
        return chalk.yellow("⊘");
      case "skipped":
        return chalk.dim("○");
      default:
        return chalk.dim("?");
    }
  }
  switch (status) {
    case "queued":
      return chalk.yellow("◷");
    case "in_progress":
      return chalk.blue("●");
    case "waiting":
      return chalk.dim("◌");
    default:
      return chalk.dim("?");
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "-";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

// CI List
ciCommands
  .command("list")
  .alias("ls")
  .description("List pipeline runs")
  .option("-b, --branch <branch>", "Filter by branch")
  .option(
    "-s, --status <status>",
    "Filter by status (queued, in_progress, completed)",
  )
  .option("-L, --limit <n>", "Maximum results", "20")
  .action(async (options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Fetching pipeline runs...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const params = new URLSearchParams();
      if (options.branch) params.append("branch", options.branch);
      if (options.status) params.append("status", options.status);
      params.append("limit", options.limit);

      const result = await getWithAuth<{ data: PipelineRun[] }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/actions/runs?${params}`,
      );

      spinner.stop();

      if (result.data.length === 0) {
        console.log(chalk.dim("No pipeline runs found."));
        return;
      }

      console.log(chalk.bold(`\n🔄 Pipeline Runs (${result.data.length})\n`));

      for (const run of result.data) {
        const icon = getStatusIcon(run.status, run.conclusion);
        const duration = formatDuration(run.duration);
        const time = new Date(run.createdAt).toLocaleString();

        console.log(
          `${icon} #${run.number} ${run.event} on ${chalk.cyan(run.branch)}`,
        );
        console.log(
          chalk.dim(`  ${run.commit.slice(0, 7)} • ${time} • ${duration}`),
        );
      }

      console.log("");
    } catch (error) {
      spinner.fail("Failed to list pipeline runs");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// CI View
ciCommands
  .command("view <run-id>")
  .description("View a pipeline run")
  .option("-j, --jobs", "Show jobs")
  .action(async (runId: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Fetching pipeline run...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const result = await getWithAuth<{ data: PipelineRun }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/actions/runs/${runId}`,
      );

      spinner.stop();

      const run = result.data;
      const icon = getStatusIcon(run.status, run.conclusion);

      console.log(chalk.bold(`\n${icon} Pipeline Run #${run.number}\n`));
      console.log(
        `Status: ${run.status}${run.conclusion ? ` (${run.conclusion})` : ""}`,
      );
      console.log(`Event: ${run.event}`);
      console.log(`Branch: ${chalk.cyan(run.branch)}`);
      console.log(`Commit: ${run.commit.slice(0, 7)}`);
      console.log(
        `Started: ${run.startedAt ? new Date(run.startedAt).toLocaleString() : "-"}`,
      );
      console.log(`Duration: ${formatDuration(run.duration)}`);

      if (run.jobs && run.jobs.length > 0) {
        console.log(chalk.bold("\nJobs:"));
        for (const job of run.jobs) {
          const jobIcon = getStatusIcon(job.status, job.conclusion);
          console.log(`  ${jobIcon} ${job.name}`);
        }
      }

      console.log("");
    } catch (error) {
      spinner.fail("Failed to fetch pipeline run");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// CI Trace (stream logs)
ciCommands
  .command("trace <job-id>")
  .alias("logs")
  .description("Stream job logs")
  .option("-f, --follow", "Follow log output")
  .action(async (jobId: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Fetching job logs...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const result = await getWithAuth<{ data: { logs: string } }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/actions/jobs/${jobId}/logs`,
      );

      spinner.stop();

      console.log(result.data.logs);
    } catch (error) {
      spinner.fail("Failed to fetch job logs");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// CI Retry
ciCommands
  .command("retry <run-id>")
  .alias("rerun")
  .description("Retry a failed pipeline run")
  .option("--failed-only", "Only retry failed jobs")
  .action(async (runId: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Retrying pipeline run #${runId}...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      await postWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/actions/runs/${runId}/rerun`,
        { failedOnly: options.failedOnly },
      );

      spinner.succeed(`Retried pipeline run #${runId}`);
    } catch (error) {
      spinner.fail("Failed to retry pipeline run");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// CI Cancel
ciCommands
  .command("cancel <run-id>")
  .description("Cancel a running pipeline")
  .action(async (runId: string) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora(`Cancelling pipeline run #${runId}...`).start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      await postWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/actions/runs/${runId}/cancel`,
        {},
      );

      spinner.succeed(`Cancelled pipeline run #${runId}`);
    } catch (error) {
      spinner.fail("Failed to cancel pipeline run");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// CI Status (current branch)
ciCommands
  .command("status")
  .description("Show CI status for current branch")
  .action(async () => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.red("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Checking CI status...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const currentBranch = (
        await git.revparse(["--abbrev-ref", "HEAD"])
      ).trim();

      const result = await getWithAuth<{ data: PipelineRun[] }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/actions/runs?branch=${currentBranch}&limit=1`,
      );

      spinner.stop();

      if (result.data.length === 0) {
        console.log(chalk.dim(`No CI runs found for branch ${currentBranch}`));
        return;
      }

      const run = result.data[0];
      const icon = getStatusIcon(run.status, run.conclusion);

      console.log(
        `\n${icon} ${run.status}${run.conclusion ? ` (${run.conclusion})` : ""}`,
      );
      console.log(chalk.dim(`  Run #${run.number} on ${currentBranch}`));
      console.log(
        chalk.dim(
          `  ${run.commit.slice(0, 7)} • ${formatDuration(run.duration)}`,
        ),
      );
      console.log("");
    } catch (error) {
      spinner.fail("Failed to check CI status");
      console.error(
        chalk.red(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

export default ciCommands;
