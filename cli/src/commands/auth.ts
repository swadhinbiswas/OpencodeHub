/**
 * Auth Commands
 * GitHub-style authentication for OpenCodeHub CLI
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getConfig, saveConfig } from "../lib/config.js";
import { apiCall } from "../lib/api.js";

export const authCommands = new Command("auth")
    .description("Authentication commands");

// Login - GitHub style
authCommands
    .command("login")
    .description("Login to OpenCodeHub")
    .option("-u, --url <url>", "OpenCodeHub server URL", "http://localhost:3000")
    .option("--with-token", "Authenticate using a Personal Access Token")
    .option("-t, --token <token>", "Personal access token (for non-interactive use)")
    .action(async (options) => {
        console.log(chalk.blue("\n🔐 OpenCodeHub Login\n"));

        try {
            let token: string;
            const serverUrl = options.url;

            if (options.token) {
                // Token provided directly via CLI
                token = options.token;
            } else if (options.withToken) {
                // Interactive token entry (GitHub style: gh auth login --with-token)
                console.log(chalk.dim("Tip: You can create a Personal Access Token at:"));
                console.log(chalk.cyan(`${serverUrl}/settings/tokens\n`));

                const answers = await inquirer.prompt([
                    {
                        type: "password",
                        name: "token",
                        message: "Paste your token:",
                        mask: "*",
                    },
                ]);
                token = answers.token;
            } else {
                // Default: Open browser for token creation (like gh auth login)
                console.log(chalk.yellow("! No token provided."));
                console.log(chalk.dim("\nTo authenticate, you need a Personal Access Token."));
                console.log(chalk.dim("Create one at: ") + chalk.cyan(`${serverUrl}/settings/tokens`));
                console.log();

                const { useToken } = await inquirer.prompt([
                    {
                        type: "confirm",
                        name: "useToken",
                        message: "Do you have a token to paste?",
                        default: true,
                    },
                ]);

                if (!useToken) {
                    console.log(chalk.dim("\nRun ") + chalk.cyan("och auth login --with-token") + chalk.dim(" after creating a token."));
                    process.exit(0);
                }

                const answers = await inquirer.prompt([
                    {
                        type: "password",
                        name: "token",
                        message: "Paste your token:",
                        mask: "*",
                    },
                ]);
                token = answers.token;
            }

            // Validate token
            const spinner = ora("Validating token...").start();

            if (!token.startsWith("och_")) {
                spinner.fail("Invalid token format");
                console.error(chalk.red("Token should start with 'och_'"));
                process.exit(1);
            }

            // Test the token by getting user info
            const response = await fetch(`${serverUrl}/api/user`, {
                headers: {
                    "Authorization": `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                spinner.fail("Invalid or expired token");
                process.exit(1);
            }

            const userData = await response.json();
            const username = userData.data?.username || "unknown";

            spinner.succeed(`Authenticated as ${chalk.green(username)}`);

            // Save config
            saveConfig({
                serverUrl,
                token,
            });

            console.log(chalk.green("\n✓ Logged in to " + serverUrl));
            console.log(chalk.dim("  Token saved to ~/.opencodehub/config.json"));
        } catch (error) {
            console.error(chalk.red("Login failed"));
            console.error(chalk.dim(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// Logout
authCommands
    .command("logout")
    .description("Logout from OpenCodeHub")
    .action(async () => {
        saveConfig({ serverUrl: "", token: "" });
        console.log(chalk.green("✓ Logged out successfully"));
    });

// Status
authCommands
    .command("status")
    .description("Show authentication status")
    .action(async () => {
        const config = getConfig();

        if (config.token) {
            const spinner = ora("Checking authentication...").start();

            try {
                const response = await fetch(`${config.serverUrl}/api/user`, {
                    headers: {
                        "Authorization": `Bearer ${config.token}`,
                    },
                });

                if (response.ok) {
                    const userData = await response.json();
                    spinner.succeed("Authenticated");
                    console.log(chalk.dim("  User: ") + chalk.cyan(userData.data?.username || "unknown"));
                    console.log(chalk.dim("  Server: ") + config.serverUrl);
                    console.log(chalk.dim("  Token: ") + config.token.slice(0, 12) + "...");
                } else {
                    spinner.fail("Token is invalid or expired");
                    console.log(chalk.dim("  Run ") + chalk.cyan("och auth login") + chalk.dim(" to re-authenticate"));
                }
            } catch (error) {
                spinner.fail("Could not connect to server");
                console.log(chalk.dim("  Server: ") + config.serverUrl);
            }
        } else {
            console.log(chalk.yellow("✗ Not authenticated"));
            console.log(chalk.dim("  Run ") + chalk.cyan("och auth login") + chalk.dim(" to authenticate"));
        }
    });

export default authCommands;

