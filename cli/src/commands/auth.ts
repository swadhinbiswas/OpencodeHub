/**
 * Auth Commands
 * Authentication for OpenCodeHub CLI
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getConfig, saveConfig } from "../lib/config.js";
import { apiCall } from "../lib/api.js";

export const authCommands = new Command("auth")
    .description("Authentication commands");

// Login
authCommands
    .command("login")
    .description("Login to OpenCodeHub")
    .option("-u, --url <url>", "OpenCodeHub server URL", "http://localhost:4321")
    .option("-t, --token <token>", "Personal access token")
    .action(async (options) => {
        console.log(chalk.blue("\n🔐 OpenCodeHub Login\n"));

        try {
            let token = options.token;

            if (!token) {
                // Interactive login
                const answers = await inquirer.prompt([
                    {
                        type: "input",
                        name: "email",
                        message: "Email:",
                    },
                    {
                        type: "password",
                        name: "password",
                        message: "Password:",
                        mask: "*",
                    },
                ]);

                const spinner = ora("Authenticating...").start();

                // Call auth API
                const response = await apiCall(options.url, "/api/auth/login", "POST", {
                    email: answers.email,
                    password: answers.password,
                });

                if (response.token) {
                    token = response.token;
                } else {
                    spinner.fail("Authentication failed");
                    console.error(chalk.red(response.error || "Invalid credentials"));
                    process.exit(1);
                }

                spinner.succeed("Authenticated successfully");
            }

            // Save config
            saveConfig({
                serverUrl: options.url,
                token,
            });

            console.log(chalk.green("\n✓ Logged in to " + options.url));
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
            console.log(chalk.green("✓ Authenticated"));
            console.log(chalk.dim("  Server: " + config.serverUrl));
        } else {
            console.log(chalk.yellow("✗ Not authenticated"));
            console.log(chalk.dim("  Run ") + chalk.cyan("och auth login") + chalk.dim(" to authenticate"));
        }
    });

export default authCommands;
