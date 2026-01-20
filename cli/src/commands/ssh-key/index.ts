/**
 * SSH Key Commands
 * Manage SSH keys from the CLI
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getConfig } from "../../lib/config.js";
import { getWithAuth, postWithAuth, deleteWithAuth } from "../../lib/api.js";

interface SSHKey {
    id: string;
    title: string;
    key: string;
    fingerprint: string;
    createdAt: string;
    lastUsedAt?: string;
}

export const sshKeyCommands = new Command("ssh-key")
    .description("Manage SSH keys");

// SSH Key Add
sshKeyCommands
    .command("add")
    .description("Add an SSH key to your account")
    .option("-t, --title <title>", "Key title")
    .option("-f, --file <path>", "Path to public key file")
    .action(async (options) => {
        const config = getConfig();
        if (!config.token) {
            console.error(chalk.red("Not logged in. Run 'och auth login' first."));
            process.exit(1);
        }

        try {
            let publicKey: string;
            let title = options.title;

            if (options.file) {
                // Read from file
                const keyPath = options.file.replace("~", os.homedir());
                if (!fs.existsSync(keyPath)) {
                    console.error(chalk.red(`File not found: ${keyPath}`));
                    process.exit(1);
                }
                publicKey = fs.readFileSync(keyPath, "utf-8").trim();
            } else {
                // Look for default keys
                const sshDir = path.join(os.homedir(), ".ssh");
                const defaultKeys = ["id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"];
                const availableKeys: { name: string; path: string }[] = [];

                for (const keyFile of defaultKeys) {
                    const keyPath = path.join(sshDir, keyFile);
                    if (fs.existsSync(keyPath)) {
                        availableKeys.push({ name: keyFile, path: keyPath });
                    }
                }

                if (availableKeys.length === 0) {
                    console.log(chalk.yellow("No SSH keys found in ~/.ssh/"));
                    console.log(chalk.dim("Generate one with: ssh-keygen -t ed25519"));
                    process.exit(1);
                }

                const { selectedKey } = await inquirer.prompt([
                    {
                        type: "list",
                        name: "selectedKey",
                        message: "Select SSH key to add:",
                        choices: availableKeys.map(k => ({
                            name: k.name,
                            value: k.path,
                        })),
                    },
                ]);

                publicKey = fs.readFileSync(selectedKey, "utf-8").trim();
            }

            // Parse key type and validate
            if (!publicKey.startsWith("ssh-") && !publicKey.startsWith("ecdsa-")) {
                console.error(chalk.red("Invalid SSH public key format"));
                process.exit(1);
            }

            // Get title if not provided
            if (!title) {
                const defaultTitle = `${os.userInfo().username}@${os.hostname()}`;
                const answers = await inquirer.prompt([
                    {
                        type: "input",
                        name: "title",
                        message: "Key title:",
                        default: defaultTitle,
                    },
                ]);
                title = answers.title;
            }

            const spinner = ora("Adding SSH key...").start();

            const result = await postWithAuth<{ data: SSHKey }>(
                "/api/user/ssh-keys",
                { title, key: publicKey }
            );

            spinner.succeed(`Added SSH key: ${chalk.cyan(title)}`);
            console.log(chalk.dim(`  Fingerprint: ${result.data.fingerprint}`));
        } catch (error) {
            console.error(chalk.red("Failed to add SSH key"));
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// SSH Key List
sshKeyCommands
    .command("list")
    .alias("ls")
    .description("List your SSH keys")
    .action(async () => {
        const config = getConfig();
        if (!config.token) {
            console.error(chalk.red("Not logged in. Run 'och auth login' first."));
            process.exit(1);
        }

        const spinner = ora("Fetching SSH keys...").start();

        try {
            const result = await getWithAuth<{ data: SSHKey[] }>("/api/user/ssh-keys");

            spinner.stop();

            if (result.data.length === 0) {
                console.log(chalk.dim("No SSH keys found."));
                console.log(chalk.dim("Add one with: och ssh-key add"));
                return;
            }

            console.log(chalk.bold(`\n🔑 SSH Keys (${result.data.length})\n`));

            for (const key of result.data) {
                const keyType = key.key.split(" ")[0].replace("ssh-", "").toUpperCase();
                console.log(`  ${chalk.cyan(key.title)} ${chalk.dim(`(${keyType})`)}`);
                console.log(chalk.dim(`    ID: ${key.id}`));
                console.log(chalk.dim(`    Fingerprint: ${key.fingerprint}`));
                console.log(chalk.dim(`    Added: ${new Date(key.createdAt).toLocaleDateString()}`));
                if (key.lastUsedAt) {
                    console.log(chalk.dim(`    Last used: ${new Date(key.lastUsedAt).toLocaleDateString()}`));
                }
                console.log("");
            }
        } catch (error) {
            spinner.fail("Failed to list SSH keys");
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

// SSH Key Delete
sshKeyCommands
    .command("delete <id>")
    .alias("rm")
    .description("Delete an SSH key")
    .option("-y, --yes", "Skip confirmation")
    .action(async (id: string, options) => {
        const config = getConfig();
        if (!config.token) {
            console.error(chalk.red("Not logged in. Run 'och auth login' first."));
            process.exit(1);
        }

        try {
            // Get key info first
            const spinner = ora("Fetching key info...").start();
            const result = await getWithAuth<{ data: SSHKey[] }>("/api/user/ssh-keys");
            const key = result.data.find(k => k.id === id);
            spinner.stop();

            if (!key) {
                console.error(chalk.red(`SSH key not found: ${id}`));
                process.exit(1);
            }

            if (!options.yes) {
                const { confirm } = await inquirer.prompt([
                    {
                        type: "confirm",
                        name: "confirm",
                        message: `Delete SSH key "${key.title}"?`,
                        default: false,
                    },
                ]);
                if (!confirm) {
                    console.log(chalk.dim("Cancelled."));
                    return;
                }
            }

            const deleteSpinner = ora("Deleting SSH key...").start();

            await deleteWithAuth(`/api/user/ssh-keys/${id}`);

            deleteSpinner.succeed(`Deleted SSH key: ${chalk.cyan(key.title)}`);
        } catch (error) {
            console.error(chalk.red("Failed to delete SSH key"));
            console.error(chalk.red(error instanceof Error ? error.message : "Unknown error"));
            process.exit(1);
        }
    });

export default sshKeyCommands;
