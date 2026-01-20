/**
 * Config Commands
 * Manage CLI configuration
 */

import { Command } from "commander";
import chalk from "chalk";
import Conf from "conf";

interface OchConfig {
    serverUrl: string;
    token: string;
    defaultBranch: string;
    editor: string;
    pager: string;
}

const config = new Conf<OchConfig>({
    projectName: "opencodehub-cli",
    defaults: {
        serverUrl: "http://localhost:4321",
        token: "",
        defaultBranch: "main",
        editor: "",
        pager: "",
    },
});

const configDescriptions: Record<string, string> = {
    serverUrl: "OpenCodeHub server URL",
    token: "Personal access token",
    defaultBranch: "Default base branch for PRs",
    editor: "Editor to use for interactive editing",
    pager: "Pager to use for long output",
};

export const configCommands = new Command("config")
    .description("Manage CLI configuration");

// Config List
configCommands
    .command("list")
    .alias("ls")
    .description("List all configuration values")
    .action(() => {
        console.log(chalk.bold("\n⚙️ CLI Configuration\n"));

        const keys = ["serverUrl", "defaultBranch", "editor", "pager"];

        for (const key of keys) {
            const value = config.get(key as keyof OchConfig);
            const desc = configDescriptions[key] || "";
            const displayValue = value || chalk.dim("(not set)");

            console.log(`${chalk.cyan(key)}: ${displayValue}`);
            if (desc) {
                console.log(chalk.dim(`  ${desc}`));
            }
        }

        // Show token status (not the actual token)
        const hasToken = !!config.get("token");
        console.log(`${chalk.cyan("token")}: ${hasToken ? chalk.green("●") + " configured" : chalk.dim("(not set)")}`);
        console.log(chalk.dim("  Personal access token"));

        console.log(chalk.dim(`\nConfig file: ${config.path}`));
        console.log("");
    });

// Config Get
configCommands
    .command("get <key>")
    .description("Get a configuration value")
    .action((key: string) => {
        const value = config.get(key as keyof OchConfig);

        if (key === "token") {
            if (value) {
                console.log(value.slice(0, 12) + "...");
            } else {
                console.log(chalk.dim("(not set)"));
            }
        } else if (value !== undefined) {
            console.log(value);
        } else {
            console.error(chalk.red(`Unknown config key: ${key}`));
            console.log(chalk.dim("Available keys: serverUrl, token, defaultBranch, editor, pager"));
            process.exit(1);
        }
    });

// Config Set
configCommands
    .command("set <key> <value>")
    .description("Set a configuration value")
    .action((key: string, value: string) => {
        const validKeys = ["serverUrl", "token", "defaultBranch", "editor", "pager"];

        if (!validKeys.includes(key)) {
            console.error(chalk.red(`Unknown config key: ${key}`));
            console.log(chalk.dim(`Available keys: ${validKeys.join(", ")}`));
            process.exit(1);
        }

        config.set(key as keyof OchConfig, value);
        console.log(chalk.green(`✓ Set ${key} = ${key === "token" ? value.slice(0, 12) + "..." : value}`));
    });

// Config Unset
configCommands
    .command("unset <key>")
    .alias("delete")
    .description("Unset a configuration value")
    .action((key: string) => {
        const validKeys = ["serverUrl", "token", "defaultBranch", "editor", "pager"];

        if (!validKeys.includes(key)) {
            console.error(chalk.red(`Unknown config key: ${key}`));
            process.exit(1);
        }

        config.delete(key as keyof OchConfig);
        console.log(chalk.green(`✓ Unset ${key}`));
    });

// Config Path
configCommands
    .command("path")
    .description("Show config file path")
    .action(() => {
        console.log(config.path);
    });

// Config Reset
configCommands
    .command("reset")
    .description("Reset all configuration to defaults")
    .option("-y, --yes", "Skip confirmation")
    .action(async (options) => {
        if (!options.yes) {
            const inquirer = await import("inquirer");
            const { confirm } = await inquirer.default.prompt([
                {
                    type: "confirm",
                    name: "confirm",
                    message: "Reset all configuration to defaults?",
                    default: false,
                },
            ]);
            if (!confirm) {
                console.log(chalk.dim("Cancelled."));
                return;
            }
        }

        config.clear();
        console.log(chalk.green("✓ Configuration reset to defaults"));
    });

export default configCommands;
