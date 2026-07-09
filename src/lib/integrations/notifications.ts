/**
 * Notification Dispatcher
 * Central hub for sending notifications to configured integrations
 */

import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger";
import { sendTeamsMessage, createPRCard, createIssueCard, createCICard } from "./teams";
import { sendDiscordMessage, createPREmbed, createIssueEmbed, createCIEmbed, createPushEmbed, type DiscordWebhookPayload } from "./discord";

export type NotificationEvent =
    | { type: "pr"; action: "opened" | "merged" | "closed" | "review_requested"; data: PRNotificationData }
    | { type: "issue"; action: "opened" | "closed" | "commented"; data: IssueNotificationData }
    | { type: "ci"; action: "completed"; data: CINotificationData }
    | { type: "push"; data: PushNotificationData };

interface PRNotificationData {
    prTitle: string;
    prNumber: number;
    prUrl: string;
    author: string;
    authorAvatar?: string;
    repository: string;
    description?: string;
    additions?: number;
    deletions?: number;
}

interface IssueNotificationData {
    issueTitle: string;
    issueNumber: number;
    issueUrl: string;
    author: string;
    authorAvatar?: string;
    repository: string;
    labels?: string[];
    body?: string;
}

interface CINotificationData {
    status: "success" | "failure" | "pending" | "running";
    workflowName: string;
    repository: string;
    branch: string;
    commitSha: string;
    commitUrl: string;
    runUrl: string;
    duration?: string;
}

interface PushNotificationData {
    repository: string;
    branch: string;
    pusher: string;
    pusherAvatar?: string;
    commits: { sha: string; message: string; url: string }[];
    compareUrl: string;
}

/**
 * Get configured webhooks for a repository
 */
async function getWebhooks(repositoryId: string) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    return db.query.webhooks.findMany({
        where: and(
            eq(schema.webhooks.repositoryId, repositoryId),
            eq(schema.webhooks.enabled, true)
        ),
    });
}

/**
 * Send notification to all configured integrations
 */
export async function sendNotification(
    repositoryId: string,
    event: NotificationEvent
): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    try {
        const webhooks = await getWebhooks(repositoryId);

        for (const webhook of webhooks) {
            // Check if this event type is enabled (events is stored as JSON string)
            let events: string[] = [];
            try {
                events = JSON.parse(webhook.events || '["*"]');
            } catch {
                events = ["*"];
            }

            if (!events.includes(event.type) && !events.includes("*")) {
                continue;
            }

            try {
                let success = false;

                if (webhook.provider === "teams") {
                    success = await sendToTeams(webhook.url, event);
                } else if (webhook.provider === "discord") {
                    success = await sendToDiscord(webhook.url, event);
                } else if (webhook.provider === "slack") {
                    success = await sendToSlack(webhook.url, event);
                } else if (webhook.provider === "linear") {
                    success = await sendToLinear(webhook.url, event);
                } else if (webhook.provider === "trello") {
                    success = await sendToTrello(webhook.url, event);
                } else if (webhook.provider === "clickup") {
                    success = await sendToClickUp(webhook.url, event);
                }

                if (success) {
                    sent++;
                } else {
                    failed++;
                }
            } catch (error) {
                logger.error({ error, webhookId: webhook.id }, "Webhook delivery failed");
                failed++;
            }
        }
    } catch (error) {
        logger.error({ error, repositoryId }, "Failed to send notifications");
    }

    return { sent, failed };
}

/**
 * Send to Microsoft Teams
 */
async function sendToTeams(webhookUrl: string, event: NotificationEvent): Promise<boolean> {
    switch (event.type) {
        case "pr":
            return sendTeamsMessage(webhookUrl, createPRCard({
                action: event.action,
                ...event.data,
            }));

        case "issue":
            return sendTeamsMessage(webhookUrl, createIssueCard({
                action: event.action,
                ...event.data,
            }));

        case "ci":
            return sendTeamsMessage(webhookUrl, createCICard(event.data));

        default:
            return false;
    }
}

/**
 * Send to Discord
 */
async function sendToDiscord(webhookUrl: string, event: NotificationEvent): Promise<boolean> {
    const payload: DiscordWebhookPayload = {
        username: "OpenCodeHub",
        embeds: [],
    };

    switch (event.type) {
        case "pr":
            payload.embeds = [createPREmbed({
                action: event.action,
                ...event.data,
            })];
            break;

        case "issue":
            payload.embeds = [createIssueEmbed({
                action: event.action,
                ...event.data,
            })];
            break;

        case "ci":
            payload.embeds = [createCIEmbed({
                ...event.data,
                status: event.data.status,
            })];
            break;

        case "push":
            payload.embeds = [createPushEmbed(event.data)];
            break;

        default:
            return false;
    }

    return sendDiscordMessage(webhookUrl, payload);
}

/**
 * Send to Slack (simplified webhook)
 */
async function sendToSlack(webhookUrl: string, event: NotificationEvent): Promise<boolean> {
    let text = "";

    switch (event.type) {
        case "pr":
            text = `*${event.action === "opened" ? "🆕" : event.action === "merged" ? "✅" : "❌"} PR #${event.data.prNumber}*: ${event.data.prTitle}\nBy ${event.data.author} in ${event.data.repository}`;
            break;

        case "issue":
            text = `*${event.action === "opened" ? "🐛" : "✅"} Issue #${event.data.issueNumber}*: ${event.data.issueTitle}\nBy ${event.data.author} in ${event.data.repository}`;
            break;

        case "ci":
            text = `*${event.data.status === "success" ? "✅" : "❌"} CI ${event.data.status}*: ${event.data.workflowName}\nBranch: ${event.data.branch}`;
            break;

        case "push":
            text = `*📤 ${event.data.commits.length} commits pushed* to \`${event.data.branch}\` by ${event.data.pusher}`;
            break;
    }

    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Test a webhook connection
 */
export async function testWebhook(
    provider: "teams" | "discord" | "slack",
    webhookUrl: string
): Promise<{ success: boolean; error?: string }> {
    try {
        let success = false;

        if (provider === "teams") {
            success = await sendTeamsMessage(webhookUrl, {
                "@type": "MessageCard",
                "@context": "http://schema.org/extensions",
                themeColor: "0078d4",
                summary: "Test notification from OpenCodeHub",
                sections: [{
                    activityTitle: "**✅ Webhook Connected!**",
                    activitySubtitle: "OpenCodeHub notifications are working correctly.",
                    markdown: true,
                }],
            });
        } else if (provider === "discord") {
            success = await sendDiscordMessage(webhookUrl, {
                username: "OpenCodeHub",
                embeds: [{
                    title: "✅ Webhook Connected!",
                    description: "OpenCodeHub notifications are working correctly.",
                    color: 0x28a745,
                    timestamp: new Date().toISOString(),
                }],
            });
        } else if (provider === "slack") {
            const response = await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: "✅ OpenCodeHub webhook connected successfully!" }),
            });
            success = response.ok;
        }

        return { success };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Connection failed"
        };
    }
}

/**
 * Send to Linear (Project Management)
 */
async function sendToLinear(webhookUrl: string, event: NotificationEvent): Promise<boolean> {
    try {
        let title = "";
        let description = "";

        if (event.type === "issue") {
            title = `[${event.data.repository}] ${event.action} Issue: ${event.data.issueTitle}`;
            description = `Issue #${event.data.issueNumber} was ${event.action} by ${event.data.author}.\n\n[View Issue](${event.data.issueUrl})`;
        } else if (event.type === "pr") {
            title = `[${event.data.repository}] ${event.action} PR: ${event.data.prTitle}`;
            description = `Pull Request #${event.data.prNumber} was ${event.action} by ${event.data.author}.\n\n[View PR](${event.data.prUrl})`;
        } else {
            return true;
        }

        const payload = {
            title,
            description,
            state: event.action === "closed" || event.action === "merged" ? "Done" : "Todo",
        };

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return response.ok;
    } catch (error) {
        logger.error({ error }, "Failed to send to Linear");
        return false;
    }
}

/**
 * Send to Trello (Project Management)
 */
async function sendToTrello(webhookUrl: string, event: NotificationEvent): Promise<boolean> {
    try {
        let name = "";
        let desc = "";

        if (event.type === "issue") {
            name = `Issue: ${event.data.issueTitle}`;
            desc = `Repo: ${event.data.repository}\nAction: ${event.action}\nActor: ${event.data.author}\nURL: ${event.data.issueUrl}`;
        } else if (event.type === "pr") {
            name = `PR: ${event.data.prTitle}`;
            desc = `Repo: ${event.data.repository}\nAction: ${event.action}\nActor: ${event.data.author}\nURL: ${event.data.prUrl}`;
        } else {
            return true;
        }

        const payload = { name, desc };

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return response.ok;
    } catch (error) {
        logger.error({ error }, "Failed to send to Trello");
        return false;
    }
}

/**
 * Send to ClickUp (Project Management)
 */
async function sendToClickUp(webhookUrl: string, event: NotificationEvent): Promise<boolean> {
    try {
        let name = "";
        let description = "";
        let status = "Open";

        if (event.type === "issue") {
            name = `Issue: ${event.data.issueTitle}`;
            description = `Action: ${event.action}\nActor: ${event.data.author}\nURL: ${event.data.issueUrl}`;
            status = event.action === "closed" ? "Closed" : "Open";
        } else if (event.type === "pr") {
            name = `PR: ${event.data.prTitle}`;
            description = `Action: ${event.action}\nActor: ${event.data.author}\nURL: ${event.data.prUrl}`;
            status = event.action === "merged" || event.action === "closed" ? "Closed" : "Open";
        } else {
            return true;
        }

        const payload = { name, description, status };

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return response.ok;
    } catch (error) {
        logger.error({ error }, "Failed to send to ClickUp");
        return false;
    }
}
