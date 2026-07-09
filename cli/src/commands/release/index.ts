/**
 * Release Commands
 * Manage releases from the CLI
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

interface Release {
  id: string;
  tagName: string;
  name: string;
  body?: string;
  isDraft: boolean;
  isPrerelease: boolean;
  createdAt: string;
  publishedAt?: string;
  author: { username: string };
  assets?: { name: string; size: number; downloadUrl: string }[];
}

export const releaseCommands = new Command("release").description(
  "Manage releases",
);

// Get repo info from git remote
async function getRepoInfo() {
  return getRepoInfoFromGit(git);
}

// Release Create
releaseCommands
  .command("create <tag>")
  .description("Create a new release")
  .option("-t, --title <title>", "Release title")
  .option("-n, --notes <notes>", "Release notes")
  .option("-F, --notes-file <file>", "Read release notes from file")
  .option("-d, --draft", "Create as draft release")
  .option("-p, --prerelease", "Mark as pre-release")
  .option("--target <branch>", "Target branch for tag", "main")
  .option("--generate-notes", "Auto-generate release notes")
  .action(async (tag: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.hex("#ff5555")("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        console.error(chalk.hex("#ff5555")("Could not determine repository"));
        process.exit(1);
      }

      let title = options.title || tag;
      let notes = options.notes;

      // Read notes from file if specified
      if (options.notesFile) {
        const fs = await import("fs");
        notes = fs.readFileSync(options.notesFile, "utf-8");
      }

      // Interactive mode if notes not provided
      if (!notes && !options.generateNotes) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "title",
            message: "Release title:",
            default: title,
          },
          {
            type: "editor",
            name: "notes",
            message: "Release notes:",
          },
        ]);
        title = answers.title;
        notes = answers.notes;
      }

      const spinner = ora(`Creating release ${tag}...`).start();

      const result = await postWithAuth<{ data: Release }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/releases`,
        {
          tagName: tag,
          name: title,
          body: notes,
          targetCommitish: options.target,
          isDraft: options.draft || false,
          isPrerelease: options.prerelease || false,
          generateNotes: options.generateNotes || false,
        },
      );

      const status = result.data.isDraft
        ? " (draft)"
        : result.data.isPrerelease
          ? " (pre-release)"
          : "";
      spinner.succeed(`Created release ${chalk.hex("#50fa7b")(tag)}${status}`);
      console.log(
        chalk.hex("#6272a4")(
          `  ${config.serverUrl}/${repoInfo.owner}/${repoInfo.repo}/releases/tag/${tag}`,
        ),
      );
    } catch (error) {
      console.error(chalk.hex("#ff5555")("Failed to create release"));
      console.error(
        chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Release List
releaseCommands
  .command("list")
  .alias("ls")
  .description("List releases")
  .option("-L, --limit <n>", "Maximum results", "10")
  .option("--include-drafts", "Include draft releases")
  .action(async (options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.hex("#ff5555")("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Fetching releases...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const params = new URLSearchParams();
      params.append("limit", options.limit);
      if (options.includeDrafts) params.append("includeDrafts", "true");

      const result = await getWithAuth<{ data: Release[] }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/releases?${params}`,
      );

      spinner.stop();

      if (result.data.length === 0) {
        console.log(chalk.hex("#6272a4")("No releases found."));
        return;
      }

      console.log(chalk.bold(`\n📦 Releases (${result.data.length})\n`));

      for (const release of result.data) {
        const icon = release.isDraft
          ? chalk.hex("#f1fa8c")("◌")
          : release.isPrerelease
            ? chalk.blue("●")
            : chalk.hex("#50fa7b")("●");
        const labels = [
          release.isDraft ? chalk.hex("#f1fa8c")("[draft]") : "",
          release.isPrerelease ? chalk.blue("[pre-release]") : "",
        ]
          .filter(Boolean)
          .join(" ");

        console.log(
          `${icon} ${chalk.bold(release.tagName)} ${release.name !== release.tagName ? `- ${release.name}` : ""} ${labels}`,
        );
        console.log(
          chalk.hex("#6272a4")(
            `  ${new Date(release.publishedAt || release.createdAt).toLocaleDateString()} • @${release.author.username}`,
          ),
        );
      }

      console.log("");
    } catch (error) {
      spinner.fail("Failed to list releases");
      console.error(
        chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Release View
releaseCommands
  .command("view <tag>")
  .description("View a release")
  .action(async (tag: string) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.hex("#ff5555")("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    const spinner = ora("Fetching release...").start();

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        spinner.fail("Could not determine repository");
        process.exit(1);
      }

      const result = await getWithAuth<{ data: Release }>(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/releases/tags/${tag}`,
      );

      spinner.stop();

      const release = result.data;

      console.log(chalk.bold(`\n📦 ${release.tagName}`));
      if (release.name !== release.tagName) {
        console.log(`Title: ${release.name}`);
      }
      console.log(`Author: @${release.author.username}`);
      console.log(
        `Date: ${new Date(release.publishedAt || release.createdAt).toLocaleString()}`,
      );

      if (release.isDraft) console.log(chalk.hex("#f1fa8c")("Status: Draft"));
      if (release.isPrerelease) console.log(chalk.blue("Status: Pre-release"));

      if (release.body) {
        console.log(chalk.hex("#6272a4")("\n─".repeat(40)));
        console.log(release.body);
      }

      if (release.assets && release.assets.length > 0) {
        console.log(chalk.bold("\nAssets:"));
        for (const asset of release.assets) {
          const size = (asset.size / 1024 / 1024).toFixed(2);
          console.log(`  📎 ${asset.name} (${size} MB)`);
        }
      }

      console.log(chalk.hex("#6272a4")("\n─".repeat(40)));
      console.log(
        chalk.hex("#6272a4")(
          `${config.serverUrl}/${repoInfo.owner}/${repoInfo.repo}/releases/tag/${tag}`,
        ),
      );
      console.log("");
    } catch (error) {
      spinner.fail("Failed to fetch release");
      console.error(
        chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Release Delete
releaseCommands
  .command("delete <tag>")
  .description("Delete a release")
  .option("-y, --yes", "Skip confirmation")
  .action(async (tag: string, options) => {
    const config = getConfig();
    if (!config.token) {
      console.error(chalk.hex("#ff5555")("Not logged in. Run 'och auth login' first."));
      process.exit(1);
    }

    try {
      const repoInfo = await getRepoInfo();
      if (!repoInfo) {
        console.error(chalk.hex("#ff5555")("Could not determine repository"));
        process.exit(1);
      }

      if (!options.yes) {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: `Delete release ${tag}?`,
            default: false,
          },
        ]);
        if (!confirm) {
          console.log(chalk.hex("#6272a4")("Cancelled."));
          return;
        }
      }

      const spinner = ora(`Deleting release ${tag}...`).start();

      const { deleteWithAuth } = await import("../../lib/api.js");
      await deleteWithAuth(
        `/api/repos/${repoInfo.owner}/${repoInfo.repo}/releases/tags/${tag}`,
      );

      spinner.succeed(`Deleted release ${tag}`);
    } catch (error) {
      console.error(chalk.hex("#ff5555")("Failed to delete release"));
      console.error(
        chalk.hex("#ff5555")(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

export default releaseCommands;
