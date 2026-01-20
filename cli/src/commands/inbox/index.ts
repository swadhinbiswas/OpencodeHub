/**
 * Inbox CLI Commands
 * View and manage PR inbox with custom sections
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import inquirer from "inquirer";
import { getWithAuth, postWithAuth } from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";

export const inboxCommand = new Command("inbox")
    .description("View and manage your PR inbox");

// List inbox items
inboxCommand
    .command("list")
    .description("List PRs in your inbox")
    .option("-s, --section <name>", "Filter by section name")
    .option("--all", "Show all PRs including read")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        const spinner = ora("Loading inbox...").start();

        try {
            const config = getConfig();
            if (!config.token) {
                spinner.fail("Not authenticated. Run 'och auth login' first.");
                process.exit(1);
            }

            // Get inbox sections
            const sectionsRes = await getWithAuth("/api/inbox-sections");
            const sections = sectionsRes.sections || [];

            // Get PRs for inbox
            const prsRes = await getWithAuth("/api/pull-requests?inbox=true");
            const prs = prsRes.pullRequests || [];

            spinner.stop();

            if (options.json) {
                console.log(JSON.stringify({ sections, prs }, null, 2));
                return;
            }

            if (prs.length === 0) {
                console.log(chalk.gray("\n  📭 Your inbox is empty!\n"));
                return;
            }

            // Display sections
            if (sections.length > 0) {
                console.log(chalk.bold("\n📥 Inbox Sections\n"));
                for (const section of sections) {
                    const sectionPrs = prs.filter((pr: any) => {
                        // Simple filter matching for demo
                        return true;
                    });
                    console.log(
                        `  ${chalk.cyan(section.name)} ${chalk.gray(`(${sectionPrs.length})`)}`
                    );
                }
                console.log();
            }

            // Display PRs
            const table = new Table({
                head: [
                    chalk.gray("#"),
                    chalk.gray("Title"),
                    chalk.gray("Author"),
                    chalk.gray("Status"),
                    chalk.gray("Updated"),
                ],
                colWidths: [8, 40, 15, 12, 12],
            });

            for (const pr of prs.slice(0, 20)) {
                const statusColor =
                    pr.state === "open"
                        ? chalk.green
                        : pr.state === "merged"
                            ? chalk.magenta
                            : chalk.red;

                table.push([
                    chalk.cyan(`#${pr.number}`),
                    pr.title.substring(0, 38),
                    pr.author?.username || "unknown",
                    statusColor(pr.state),
                    new Date(pr.updatedAt).toLocaleDateString(),
                ]);
            }

            console.log(table.toString());
            console.log(
                chalk.gray(`\n  Showing ${Math.min(prs.length, 20)} of ${prs.length} PRs\n`)
            );
        } catch (error: any) {
            spinner.fail(`Failed to load inbox: ${error.message}`);
            process.exit(1);
        }
    });

// Section management
const sectionCommand = inboxCommand
    .command("section")
    .description("Manage inbox sections");

sectionCommand
    .command("list")
    .description("List custom sections")
    .action(async () => {
        const spinner = ora("Loading sections...").start();

        try {
            const res = await getWithAuth("/api/inbox-sections");
            const sections = res.sections || [];

            spinner.stop();

            if (sections.length === 0) {
                console.log(chalk.gray("\n  No custom sections. Create one with: och inbox section create\n"));
                return;
            }

            console.log(chalk.bold("\n📑 Inbox Sections\n"));
            for (const section of sections) {
                const filters = section.filters ? Object.keys(section.filters).length : 0;
                console.log(
                    `  ${section.isDefault ? "📌" : "📁"} ${chalk.cyan(section.name)} ${chalk.gray(
                        `(${filters} filters)`
                    )}`
                );
            }
            console.log();
        } catch (error: any) {
            spinner.fail(`Failed to load sections: ${error.message}`);
        }
    });

sectionCommand
    .command("create")
    .description("Create a new inbox section")
    .action(async () => {
        try {
            const answers = await inquirer.prompt([
                {
                    type: "input",
                    name: "name",
                    message: "Section name:",
                    validate: (input) => input.length > 0 || "Name is required",
                },
                {
                    type: "checkbox",
                    name: "filters",
                    message: "Select filters:",
                    choices: [
                        { name: "Needs my review", value: "isReviewRequested" },
                        { name: "Authored by me", value: "isAuthoredByMe" },
                        { name: "CI passing", value: "ciPassing" },
                        { name: "Ready to merge", value: "readyToMerge" },
                        { name: "Has conflicts", value: "hasConflicts" },
                    ],
                },
            ]);

            const spinner = ora("Creating section...").start();

            const filters: Record<string, boolean> = {};
            for (const f of answers.filters) {
                filters[f] = true;
            }

            await postWithAuth("/api/inbox-sections", {
                name: answers.name,
                filters,
            });

            spinner.succeed(`Created section: ${chalk.cyan(answers.name)}`);
        } catch (error: any) {
            console.error(chalk.red(`Failed to create section: ${error.message}`));
        }
    });

sectionCommand
    .command("delete <name>")
    .description("Delete an inbox section")
    .action(async (name) => {
        try {
            const { confirm } = await inquirer.prompt([
                {
                    type: "confirm",
                    name: "confirm",
                    message: `Delete section "${name}"?`,
                    default: false,
                },
            ]);

            if (!confirm) {
                console.log(chalk.gray("Cancelled"));
                return;
            }

            const spinner = ora("Deleting section...").start();

            // Get section ID by name
            const res = await getWithAuth("/api/inbox-sections");
            const section = res.sections?.find((s: any) => s.name === name);

            if (!section) {
                spinner.fail(`Section "${name}" not found`);
                return;
            }

            await postWithAuth("/api/inbox-sections", {
                method: "DELETE",
                id: section.id,
            });

            spinner.succeed(`Deleted section: ${chalk.cyan(name)}`);
        } catch (error: any) {
            console.error(chalk.red(`Failed to delete section: ${error.message}`));
        }
    });

export default inboxCommand;
