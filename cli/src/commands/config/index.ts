/**
 * Config Commands
 * Manage CLI configuration
 */

import chalk from "chalk";
import { Command } from "commander";
import Conf from "conf";
import fs from "fs";
import { applyTlsConfig } from "../../lib/api.js";

interface OchConfig {
  serverUrl: string;
  token: string;
  defaultBranch: string;
  editor: string;
  pager: string;
  caFile: string;
  insecure: boolean;
}

const config = new Conf<OchConfig>({
  projectName: "opencodehub-cli",
  defaults: {
    serverUrl: "",
    token: "",
    defaultBranch: "main",
    editor: "",
    pager: "",
    caFile: "",
    insecure: false,
  },
});

const configDescriptions: Record<string, string> = {
  serverUrl: "OpenCodeHub server URL",
  token: "Personal access token",
  defaultBranch: "Default base branch for PRs",
  editor: "Editor to use for interactive editing",
  pager: "Pager to use for long output",
  caFile: "Path to custom CA bundle (self-signed TLS)",
  insecure: "Disable TLS certificate verification",
};

export const configCommands = new Command("config").description(
  "Manage CLI configuration",
);

// Config List
configCommands
  .command("list")
  .alias("ls")
  .description("List all configuration values")
  .action(() => {
    console.log(chalk.bold("\n⚙️ CLI Configuration\n"));

    const keys = [
      "serverUrl",
      "defaultBranch",
      "editor",
      "pager",
      "caFile",
      "insecure",
    ];

    for (const key of keys) {
      const value = config.get(key as keyof OchConfig);
      const desc = configDescriptions[key] || "";
      const displayValue =
        typeof value === "boolean"
          ? String(value)
          : value || chalk.dim("(not set)");

      console.log(`${chalk.cyan(key)}: ${displayValue}`);
      if (desc) {
        console.log(chalk.dim(`  ${desc}`));
      }
    }

    // Show token status (not the actual token)
    const hasToken = !!config.get("token");
    console.log(
      `${chalk.cyan("token")}: ${hasToken ? chalk.green("●") + " configured" : chalk.dim("(not set)")}`,
    );
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
      if (typeof value === "string" && value) {
        console.log(value.slice(0, 12) + "...");
      } else {
        console.log(chalk.dim("(not set)"));
      }
    } else if (value !== undefined) {
      console.log(value);
    } else {
      console.error(chalk.red(`Unknown config key: ${key}`));
      console.log(
        chalk.dim(
          "Available keys: serverUrl, token, defaultBranch, editor, pager, caFile, insecure",
        ),
      );
      process.exit(1);
    }
  });

// Config Set
configCommands
  .command("set <key> <value>")
  .description("Set a configuration value")
  .action((key: string, value: string) => {
    const validKeys = [
      "serverUrl",
      "token",
      "defaultBranch",
      "editor",
      "pager",
      "caFile",
      "insecure",
    ];

    if (!validKeys.includes(key)) {
      console.error(chalk.red(`Unknown config key: ${key}`));
      console.log(chalk.dim(`Available keys: ${validKeys.join(", ")}`));
      process.exit(1);
    }

    const normalizedValue =
      key === "insecure" ? value === "true" || value === "1" : value;

    config.set(key as keyof OchConfig, normalizedValue as any);
    const displayValue =
      key === "token" && typeof normalizedValue === "string"
        ? `${normalizedValue.slice(0, 12)}...`
        : String(normalizedValue);
    console.log(chalk.green(`✓ Set ${key} = ${displayValue}`));
  });

// Config Unset
configCommands
  .command("unset <key>")
  .alias("delete")
  .description("Unset a configuration value")
  .action((key: string) => {
    const validKeys = [
      "serverUrl",
      "token",
      "defaultBranch",
      "editor",
      "pager",
      "caFile",
      "insecure",
    ];

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

// Config Doctor
configCommands
  .command("doctor")
  .description("Validate CLI configuration and connectivity")
  .action(async () => {
    console.log(chalk.bold("\n🩺 Config Doctor\n"));

    const serverUrl = config.get("serverUrl");
    const token = config.get("token");
    const caFile = config.get("caFile");
    const insecure = config.get("insecure");

    let hasIssues = false;

    if (!serverUrl) {
      hasIssues = true;
      console.log(chalk.red("✗ serverUrl is not set"));
      console.log(chalk.dim("  Run: och config set serverUrl <url>"));
    } else {
      console.log(chalk.green("✓ serverUrl configured"));
      console.log(chalk.dim(`  ${serverUrl}`));
    }

    if (!token) {
      hasIssues = true;
      console.log(chalk.red("✗ token is not set"));
      console.log(chalk.dim("  Run: och auth login --url <url>"));
    } else {
      console.log(chalk.green("✓ token configured"));
    }

    if (caFile) {
      if (!fs.existsSync(caFile)) {
        hasIssues = true;
        console.log(chalk.red("✗ caFile does not exist"));
        console.log(chalk.dim(`  ${caFile}`));
      } else {
        console.log(chalk.green("✓ caFile found"));
        console.log(chalk.dim(`  ${caFile}`));
      }
    }

    if (insecure) {
      console.log(chalk.yellow("! insecure TLS is enabled"));
    }

    if (serverUrl && token) {
      try {
        applyTlsConfig();
        const response = await fetch(`${serverUrl}/api/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          hasIssues = true;
          console.log(chalk.red("✗ token validation failed"));
          console.log(chalk.dim(`  HTTP ${response.status}`));
        } else {
          const data = await response.json();
          const username = data?.data?.username || "unknown";
          console.log(chalk.green("✓ token is valid"));
          console.log(chalk.dim(`  Authenticated as ${username}`));
        }
      } catch (error) {
        hasIssues = true;
        console.log(chalk.red("✗ could not reach server"));
        console.log(
          chalk.dim(String(error instanceof Error ? error.message : error)),
        );
      }
    }

    if (hasIssues) {
      console.log(chalk.red("\nConfig doctor found issues."));
      process.exit(1);
    }

    console.log(chalk.green("\nConfig doctor found no issues."));
  });
