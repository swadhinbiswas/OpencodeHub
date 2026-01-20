/**
 * Notify CLI Commands
 * Manage notifications and preferences
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import inquirer from "inquirer";
import { getWithAuth, postWithAuth, patchWithAuth } from "../../lib/api.js";
import { getConfig } from "../../lib/config.js";

export const notifyCommand = new Command("notify")
    .description("Manage notifications and preferences");

// List notifications
notifyCommand
    .command("list")
    .description("List your notifications")
    .option("-u, --unread", "Show unread only")
    .option("-n, --limit <n>", "Limit results", "20")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        const spinner = ora("Loading notifications...").start();

        try {
            const config = getConfig();
            if (!config.token) {
                spinner.fail("Not authenticated. Run 'och auth login' first.");
                process.exit(1);
            }

            const filter = options.unread ? "unread" : "all";
            const res = await getWithAuth(`/api/notifications?filter=${filter}&limit=${options.limit}`);
            const notifications = res.notifications || [];

            spinner.stop();

            if (options.json) {
                console.log(JSON.stringify(notifications, null, 2));
                return;
            }

            if (notifications.length === 0) {
                console.log(chalk.gray("\n  🔔 No notifications\n"));
                return;
            }

            console.log(chalk.bold("\n🔔 Notifications\n"));

            for (const notif of notifications) {
                const icon = getNotificationIcon(notif.type);
                const time = timeAgo(notif.createdAt);
                const readIndicator = notif.isRead ? "" : chalk.cyan("●");

                console.log(
                    `  ${icon} ${readIndicator} ${chalk.white(notif.title)} ${chalk.gray(`(${time})`)}`
                );
                if (notif.body) {
                    console.log(chalk.gray(`     ${notif.body.substring(0, 60)}...`));
                }
            }

            console.log();
        } catch (error: any) {
            spinner.fail(`Failed to load notifications: ${error.message}`);
            process.exit(1);
        }
    });

// Mark notification as read
notifyCommand
    .command("read [id]")
    .description("Mark notification(s) as read")
    .option("-a, --all", "Mark all as read")
    .action(async (id, options) => {
        const spinner = ora("Marking as read...").start();

        try {
            if (options.all) {
                await postWithAuth("/api/notifications/mark-all-read", {});
                spinner.succeed("Marked all notifications as read");
            } else if (id) {
                await patchWithAuth(`/api/notifications/${id}`, { isRead: true });
                spinner.succeed("Marked notification as read");
            } else {
                spinner.fail("Specify notification ID or use --all");
            }
        } catch (error: any) {
            spinner.fail(`Failed: ${error.message}`);
        }
    });

// View/update notification settings
notifyCommand
    .command("settings")
    .description("View or update notification preferences")
    .option("--show", "Show current settings")
    .action(async (options) => {
        try {
            const config = getConfig();
            if (!config.token) {
                console.log(chalk.red("Not authenticated. Run 'och auth login' first."));
                process.exit(1);
            }

            // Get current settings
            const spinner = ora("Loading settings...").start();
            let currentSettings;
            try {
                currentSettings = await getWithAuth("/api/user/notification-preferences");
            } catch {
                currentSettings = { preferences: {}, quietHours: null };
            }
            spinner.stop();

            if (options.show) {
                console.log(chalk.bold("\n⚙️  Notification Settings\n"));

                const eventTypes = [
                    "mention", "assign", "review_request", "pr_approved",
                    "pr_merged", "ci_passed", "ci_failed"
                ];

                const table = new Table({
                    head: [chalk.gray("Event"), chalk.gray("Email"), chalk.gray("In-App")],
                });

                for (const event of eventTypes) {
                    const pref = currentSettings.preferences?.[event] || {};
                    table.push([
                        event,
                        pref.emailEnabled ? chalk.green("✓") : chalk.red("✗"),
                        pref.inAppEnabled ? chalk.green("✓") : chalk.red("✗"),
                    ]);
                }

                console.log(table.toString());

                if (currentSettings.quietHours?.isEnabled) {
                    console.log(
                        chalk.yellow(
                            `\n  🌙 Quiet hours: ${currentSettings.quietHours.startTime} - ${currentSettings.quietHours.endTime}`
                        )
                    );
                }

                console.log();
                return;
            }

            // Interactive settings update
            const { category } = await inquirer.prompt([
                {
                    type: "list",
                    name: "category",
                    message: "What would you like to configure?",
                    choices: [
                        { name: "Email notifications", value: "email" },
                        { name: "Quiet hours", value: "quietHours" },
                        { name: "Cancel", value: "cancel" },
                    ],
                },
            ]);

            if (category === "cancel") return;

            if (category === "quietHours") {
                const hours = await inquirer.prompt([
                    {
                        type: "confirm",
                        name: "enabled",
                        message: "Enable quiet hours?",
                        default: currentSettings.quietHours?.isEnabled || false,
                    },
                    {
                        type: "input",
                        name: "start",
                        message: "Start time (HH:MM):",
                        default: currentSettings.quietHours?.startTime || "22:00",
                        when: (answers) => answers.enabled,
                    },
                    {
                        type: "input",
                        name: "end",
                        message: "End time (HH:MM):",
                        default: currentSettings.quietHours?.endTime || "08:00",
                        when: (answers) => answers.enabled,
                    },
                ]);

                const saveSpinner = ora("Saving settings...").start();
                await postWithAuth("/api/user/notification-preferences", {
                    quietHours: {
                        isEnabled: hours.enabled,
                        startTime: hours.start,
                        endTime: hours.end,
                    },
                });
                saveSpinner.succeed("Quiet hours updated");
            }
        } catch (error: any) {
            console.error(chalk.red(`Failed: ${error.message}`));
        }
    });

function getNotificationIcon(type: string): string {
    const icons: Record<string, string> = {
        mention: "💬",
        assign: "👤",
        review_request: "👀",
        pr_approved: "✅",
        pr_changes_requested: "⚠️",
        pr_merged: "🎉",
        ci_passed: "✅",
        ci_failed: "❌",
        comment: "💬",
    };
    return icons[type] || "🔔";
}

function timeAgo(date: string): string {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export default notifyCommand;
