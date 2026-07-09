/**
 * Config Commands
 * Manage CLI configuration
 */

import chalk from "chalk";
import { Command } from "commander";
import fs from "fs";
import { applyTlsConfig } from "../../lib/api.js";
import {
  clearConfig,
  getConfig,
  getConfigPath,
  getTokenStorageMode,
  saveConfig,
  supportsSecureTokenStorage,
  unsetConfigKey,
} from "../../lib/config.js";

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
    const currentConfig = getConfig();
    console.log(chalk.bold("\n⚙️ CLI Configuration\n"));

    const keys = ["serverUrl", "defaultBranch", "editor", "pager", "caFile", "insecure"] as const;

    for (const key of keys) {
      const value = currentConfig[key];
      const desc = configDescriptions[key] || "";
      const displayValue =
        typeof value === "boolean"
          ? String(value)
          : value || chalk.hex("#6272a4")("(not set)");

      console.log(`${chalk.hex("#8be9fd")(key)}: ${displayValue}`);
      if (desc) {
        console.log(chalk.hex("#6272a4")(`  ${desc}`));
      }
    }

    // Show token status (not the actual token)
    const hasToken = !!currentConfig.token;
    const storageMode = getTokenStorageMode(currentConfig.serverUrl);
    const storageLabel =
      storageMode === "env"
        ? "env (OCH_TOKEN)"
        : storageMode === "keychain"
          ? "secure keychain"
          : storageMode === "file"
            ? "config file fallback"
            : "not set";
    console.log(
      `${chalk.hex("#8be9fd")("token")}: ${hasToken ? chalk.hex("#50fa7b")("●") + " configured" : chalk.hex("#6272a4")("(not set)")}`,
    );
    console.log(chalk.hex("#6272a4")(`  Personal access token (${storageLabel})`));

    console.log(chalk.hex("#6272a4")(`\nConfig file: ${getConfigPath()}`));
    if (!supportsSecureTokenStorage()) {
      console.log(
        chalk.hex("#f1fa8c")(
          "Secure keychain backend unavailable on this host. Token uses config file fallback unless OCH_TOKEN is set.",
        ),
      );
    }
    console.log("");
  });

// Config Get
configCommands
  .command("get <key>")
  .description("Get a configuration value")
  .action((key: string) => {
    const currentConfig = getConfig();

    if (key === "token") {
      if (typeof currentConfig.token === "string" && currentConfig.token) {
        console.log(currentConfig.token.slice(0, 12) + "...");
      } else {
        console.log(chalk.hex("#6272a4")("(not set)"));
      }
      return;
    }

    const validKeys = [
      "serverUrl",
      "defaultBranch",
      "editor",
      "pager",
      "caFile",
      "insecure",
      "username",
    ];

    if (!validKeys.includes(key)) {
      console.error(chalk.hex("#ff5555")(`Unknown config key: ${key}`));
      console.log(
        chalk.hex("#6272a4")(
          "Available keys: serverUrl, token, defaultBranch, editor, pager, caFile, insecure, username",
        ),
      );
      process.exit(1);
    }

    const value = currentConfig[key as keyof typeof currentConfig];
    if (value !== undefined) {
      console.log(String(value));
    } else {
      console.log(chalk.hex("#6272a4")("(not set)"));
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
      console.error(chalk.hex("#ff5555")(`Unknown config key: ${key}`));
      console.log(chalk.hex("#6272a4")(`Available keys: ${validKeys.join(", ")}`));
      process.exit(1);
    }

    const normalizedValue = key === "insecure" ? value === "true" || value === "1" : value;

    try {
      saveConfig({ [key]: normalizedValue } as any);
    } catch (error) {
      console.error(
        chalk.hex("#ff5555")(error instanceof Error ? error.message : "Invalid configuration value"),
      );
      process.exit(1);
    }
    const displayValue =
      key === "token" && typeof normalizedValue === "string"
        ? `${normalizedValue.slice(0, 12)}...`
        : String(normalizedValue);
    console.log(chalk.hex("#50fa7b")(`✓ Set ${key} = ${displayValue}`));
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
      console.error(chalk.hex("#ff5555")(`Unknown config key: ${key}`));
      process.exit(1);
    }

    unsetConfigKey(key as any);
    console.log(chalk.hex("#50fa7b")(`✓ Unset ${key}`));
  });

// Config Path
configCommands
  .command("path")
  .description("Show config file path")
  .action(() => {
    console.log(getConfigPath());
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
        console.log(chalk.hex("#6272a4")("Cancelled."));
        return;
      }
    }

    clearConfig();
    console.log(chalk.hex("#50fa7b")("✓ Configuration reset to defaults"));
  });

export default configCommands;

// Config Doctor
configCommands
  .command("doctor")
  .description("Validate CLI configuration and connectivity")
  .action(async () => {
    console.log(chalk.bold("\n🩺 Config Doctor\n"));

    const currentConfig = getConfig();
    const serverUrl = currentConfig.serverUrl;
    const token = currentConfig.token;
    const caFile = currentConfig.caFile;
    const insecure = currentConfig.insecure;

    let hasIssues = false;

    if (!serverUrl) {
      hasIssues = true;
      console.log(chalk.hex("#ff5555")("✗ serverUrl is not set"));
      console.log(chalk.hex("#6272a4")("  Run: och config set serverUrl <url>"));
    } else {
      console.log(chalk.hex("#50fa7b")("✓ serverUrl configured"));
      console.log(chalk.hex("#6272a4")(`  ${serverUrl}`));
    }

    if (!token) {
      hasIssues = true;
      console.log(chalk.hex("#ff5555")("✗ token is not set"));
      console.log(chalk.hex("#6272a4")("  Run: och auth login --url <url>"));
    } else {
      console.log(chalk.hex("#50fa7b")("✓ token configured"));
    }

    if (caFile) {
      if (!fs.existsSync(caFile)) {
        hasIssues = true;
        console.log(chalk.hex("#ff5555")("✗ caFile does not exist"));
        console.log(chalk.hex("#6272a4")(`  ${caFile}`));
      } else {
        console.log(chalk.hex("#50fa7b")("✓ caFile found"));
        console.log(chalk.hex("#6272a4")(`  ${caFile}`));
      }
    }

    if (insecure) {
      console.log(chalk.hex("#f1fa8c")("! insecure TLS is enabled"));
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
          console.log(chalk.hex("#ff5555")("✗ token validation failed"));
          console.log(chalk.hex("#6272a4")(`  HTTP ${response.status}`));
        } else {
          const data = await response.json();
          const username = data?.data?.username || "unknown";
          console.log(chalk.hex("#50fa7b")("✓ token is valid"));
          console.log(chalk.hex("#6272a4")(`  Authenticated as ${username}`));
        }
      } catch (error) {
        hasIssues = true;
        console.log(chalk.hex("#ff5555")("✗ could not reach server"));
        console.log(
          chalk.hex("#6272a4")(String(error instanceof Error ? error.message : error)),
        );
      }
    }

    if (hasIssues) {
      console.log(chalk.hex("#ff5555")("\nConfig doctor found issues."));
      process.exit(1);
    }

    console.log(chalk.hex("#50fa7b")("\nConfig doctor found no issues."));
  });
