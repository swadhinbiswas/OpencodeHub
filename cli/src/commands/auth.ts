/**
 * Auth Commands
 * GitHub-style authentication for OpenCodeHub CLI
 */

import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { applyTlsConfig } from "../lib/api.js";
import {
  getConfig,
  normalizeServerUrl,
  saveConfig,
  supportsSecureTokenStorage,
} from "../lib/config.js";

export const authCommands = new Command("auth").description(
  "Authentication commands",
);

// Login - GitHub style
authCommands
  .command("login")
  .description("Login to OpenCodeHub")
  .option("-u, --url <url>", "OpenCodeHub server URL")
  .option("--ca-file <path>", "Path to custom CA bundle (self-signed TLS)")
  .option("--insecure", "Disable TLS certificate verification")
  .option("--with-token", "Authenticate using a Personal Access Token")
  .option(
    "-t, --token <token>",
    "Personal access token (for non-interactive use)",
  )
  .action(async (options) => {
    console.log(chalk.blue("\n🔐 OpenCodeHub Login\n"));

    try {
      const existingConfig = getConfig();
      let token: string;
      let serverUrl = options.url || existingConfig.serverUrl;

      if (!serverUrl) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "serverUrl",
            message: "OpenCodeHub server URL:",
            validate: (input) => input.length > 0 || "Server URL is required",
          },
        ]);
        serverUrl = answers.serverUrl;
      }
      serverUrl = normalizeServerUrl(serverUrl);

      if (options.token) {
        // Token provided directly via CLI
        token = options.token;
      } else if (options.withToken) {
        // Interactive token entry (GitHub style: gh auth login --with-token)
        console.log(
          chalk.hex("#6272a4")("Tip: You can create a Personal Access Token at:"),
        );
        console.log(chalk.hex("#8be9fd")(`${serverUrl}/settings/tokens\n`));

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
        console.log(chalk.hex("#f1fa8c")("! No token provided."));
        console.log(
          chalk.hex("#6272a4")("\nTo authenticate, you need a Personal Access Token."),
        );
        console.log(
          chalk.hex("#6272a4")("Create one at: ") +
            chalk.hex("#8be9fd")(`${serverUrl}/settings/tokens`),
        );
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
          console.log(
            chalk.hex("#6272a4")("\nRun ") +
              chalk.hex("#8be9fd")("och auth login --with-token") +
              chalk.hex("#6272a4")(" after creating a token."),
          );
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

      if (token.trim().length < 8) {
        spinner.fail("Invalid token format");
        console.error(chalk.hex("#ff5555")("Token looks too short"));
        process.exit(1);
      }

      // Test the token by getting user info
      saveConfig({
        serverUrl,
        caFile: options.caFile ?? existingConfig.caFile,
        insecure: options.insecure ?? existingConfig.insecure,
      });

      applyTlsConfig();

      const response = await fetch(`${serverUrl}/api/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        spinner.fail("Invalid or expired token");
        process.exit(1);
      }

      const userData = await response.json();
      const username = userData.data?.username || "unknown";

      spinner.succeed(`Authenticated as ${chalk.hex("#50fa7b")(username)}`);

      // Save config
      saveConfig({
        serverUrl,
        token,
        username,
        caFile: options.caFile ?? existingConfig.caFile,
        insecure: options.insecure ?? existingConfig.insecure,
      });

      console.log(chalk.hex("#50fa7b")("\n✓ Logged in to " + serverUrl));
      console.log(
        chalk.hex("#6272a4")(
          supportsSecureTokenStorage()
            ? "  Token saved to system keychain"
            : "  Token saved to CLI config fallback (set OCH_TOKEN to avoid local persistence)",
        ),
      );
    } catch (error) {
      console.error(chalk.hex("#ff5555")("Login failed"));
      console.error(
        chalk.hex("#6272a4")(error instanceof Error ? error.message : "Unknown error"),
      );
      process.exit(1);
    }
  });

// Logout
authCommands
  .command("logout")
  .description("Logout from OpenCodeHub")
  .action(async () => {
    saveConfig({ serverUrl: "", token: "" });
    console.log(chalk.hex("#50fa7b")("✓ Logged out successfully"));
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
        applyTlsConfig();
        const response = await fetch(`${config.serverUrl}/api/user`, {
          headers: {
            Authorization: `Bearer ${config.token}`,
          },
        });

        if (response.ok) {
          const userData = await response.json();
          spinner.succeed("Authenticated");
          console.log(
            chalk.hex("#6272a4")("  User: ") +
              chalk.hex("#8be9fd")(userData.data?.username || "unknown"),
          );
          console.log(chalk.hex("#6272a4")("  Server: ") + config.serverUrl);
          console.log(
            chalk.hex("#6272a4")("  Token: ") + config.token.slice(0, 12) + "...",
          );
        } else {
          spinner.fail("Token is invalid or expired");
          console.log(
            chalk.hex("#6272a4")("  Run ") +
              chalk.hex("#8be9fd")("och auth login") +
              chalk.hex("#6272a4")(" to re-authenticate"),
          );
        }
      } catch (error) {
        spinner.fail("Could not connect to server");
        console.log(chalk.hex("#6272a4")("  Server: ") + config.serverUrl);
      }
    } else {
      console.log(chalk.hex("#f1fa8c")("✗ Not authenticated"));
      console.log(
        chalk.hex("#6272a4")("  Run ") +
          chalk.hex("#8be9fd")("och auth login") +
          chalk.hex("#6272a4")(" to authenticate"),
      );
    }
  });

export default authCommands;
