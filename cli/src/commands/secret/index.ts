/**
 * Secret Commands
 * Manage repository and organization secrets from the CLI
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { simpleGit } from "simple-git";
import { getConfig } from "../../lib/config.js";
import { getWithAuth, postWithAuth, deleteWithAuth } from "../../lib/api.js";

const git = simpleGit();

interface Secret {
    name: string;
    createdAt: string;
    updatedAt: string;
}

export const secretCommands = new Command("secret")
    .description("Manage secrets");

// Get repo info from git remote
async function getRepoInfo(): Promise<{ owner: string; repo: string } | null> {
    try {
        const remotes = await git.getRemotes(true);
        const origin = remotes.find(r => r.name === "origin");
        if (!origin?.refs?.push) return null;

        const url = origin.refs.push;
        const match = url.match(/[:/]([^/]+)\/([^/.]+)/);
        if (match) {
            return { owner: match[1], repo: match[2] };
        }
        return null;
    } catch {
        return null;
    }
}

// Secret Set
secretCommands
    .command("set <name>")
    .description("Set a secret")
    .option("-b, --body <value>", "Secret value (not recommended, use stdin)")
    .option("-o, --org <org>", "Set organization secret instead of repo secret")
    .option("-e, --env <env>", "Set environment-specific secret")
    .action(async (name: string, options) => {
        const config = getConfig();
        if (!config.token) {
            console.error(chalk.red("Not logged in. Run 'och auth login' first."));
            process.exit(1);
        }

        try {
            let value = options.body;

            if (!value) {
                // Check if stdin has data (piped input)
                if (!process.stdin.isTTY) {
                    const chunks: Buffer[] = [];
                    for await (const chunk of process.stdin) {
                        chunks.push(chunk);
                    }
                    value = Buffer.concat(chunks).toString().trim();
                } else {
                    // Interactive prompt
                    const answers = await inquirer.prompt([
                        {
                            type: "password",
                            name: "value",
                            message: `Enter value for ${name}:`,
                            mask: "*",
                        },
                    ]);
                    value = answers.value;
                }
            }

            if (!value) {
                console.error(chalk.red("Secret value cannot be empty"));
                process.exit(1);
            }

            const spinner = ora(`Setting secret ${name}...`).start();

            let endpoint: string;

            if (options.org) {
                endpoint = `/api/orgs/${options.org}/actions/secrets/${name}`;
            } else {
                const repoInfo = await getRepoInfo();
                if (!repoInfo) {
                    spinner.fail("Could not determine repository");
                    process.exit(1);
                }
                const envPart = options.env ? `/environments/${options.env}` : "";
                endpoint = `/api/repos/${repoInfo.owner}/${repoInfo.repo}${envPart}/actions/secrets/${name}`;
            }

            await postWithAuth(endpoint, { value });

            spinner.succeed(`Set secret ${chalk.cyan(name)}`);
        } catch (error) {
            console.error(chalk.red("Failed to set secret"));
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Secret List
secretCommands
    .command("list")
    .alias("ls")
    .description("List secrets")
    .option("-o, --org <org>", "List organization secrets")
    .option("-e, --env <env>", "List environment secrets")
    .action(async (options) => {
        const config = getConfig();
        if (!config.token) {
            console.error(chalk.red("Not logged in. Run 'och auth login' first."));
            process.exit(1);
        }

        const spinner = ora("Fetching secrets...").start();

        try {
            let endpoint: string;
            let context: string;

            if (options.org) {
                endpoint = `/api/orgs/${options.org}/actions/secrets`;
                context = `organization ${options.org}`;
            } else {
                const repoInfo = await getRepoInfo();
                if (!repoInfo) {
                    spinner.fail("Could not determine repository");
                    process.exit(1);
                }
                const envPart = options.env ? `/environments/${options.env}` : "";
                endpoint = `/api/repos/${repoInfo.owner}/${repoInfo.repo}${envPart}/actions/secrets`;
                context = options.env ? `environment ${options.env}` : `repository ${repoInfo.owner}/${repoInfo.repo}`;
            }

            const result = await getWithAuth<{ data: Secret[] }>(endpoint);

            spinner.stop();

            if (result.data.length === 0) {
                console.log(chalk.dim(`No secrets found for ${context}`));
                return;
            }

            console.log(chalk.bold(`\n🔐 Secrets for ${context}\n`));

            for (const secret of result.data) {
                console.log(`  ${chalk.cyan(secret.name)}`);
                console.log(chalk.dim(`    Updated ${new Date(secret.updatedAt).toLocaleDateString()}`));
            }

            console.log("");
        } catch (error) {
            spinner.fail("Failed to list secrets");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Secret Delete
secretCommands
    .command("delete <name>")
    .alias("rm")
    .description("Delete a secret")
    .option("-o, --org <org>", "Delete organization secret")
    .option("-e, --env <env>", "Delete environment secret")
    .option("-y, --yes", "Skip confirmation")
    .action(async (name: string, options) => {
        const config = getConfig();
        if (!config.token) {
            console.error(chalk.red("Not logged in. Run 'och auth login' first."));
            process.exit(1);
        }

        try {
            if (!options.yes) {
                const { confirm } = await inquirer.prompt([
                    {
                        type: "confirm",
                        name: "confirm",
                        message: `Delete secret ${name}?`,
                        default: false,
                    },
                ]);
                if (!confirm) {
                    console.log(chalk.dim("Cancelled."));
                    return;
                }
            }

            const spinner = ora(`Deleting secret ${name}...`).start();

            let endpoint: string;

            if (options.org) {
                endpoint = `/api/orgs/${options.org}/actions/secrets/${name}`;
            } else {
                const repoInfo = await getRepoInfo();
                if (!repoInfo) {
                    spinner.fail("Could not determine repository");
                    process.exit(1);
                }
                const envPart = options.env ? `/environments/${options.env}` : "";
                endpoint = `/api/repos/${repoInfo.owner}/${repoInfo.repo}${envPart}/actions/secrets/${name}`;
            }

            await deleteWithAuth(endpoint);

            spinner.succeed(`Deleted secret ${chalk.cyan(name)}`);
        } catch (error) {
            console.error(chalk.red("Failed to delete secret"));
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

export default secretCommands;
