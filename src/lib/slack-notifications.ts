/**
 * Slack Notification Library
 * Send actionable notifications to Slack channels and users
 */

import { eq, and } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { logger } from "@/lib/logger";

// Types
export interface SlackMessage {
    channel: string;
    text: string;
    blocks?: SlackBlock[];
    thread_ts?: string;
    unfurl_links?: boolean;
    unfurl_media?: boolean;
}

export interface SlackBlock {
    type: string;
    text?: {
        type: string;
        text: string;
        emoji?: boolean;
    };
    accessory?: {
        type: string;
        text?: { type: string; text: string };
        url?: string;
        action_id?: string;
    };
    elements?: Array<{
        type: string;
        text?: { type: string; text: string; emoji?: boolean };
        url?: string;
        action_id?: string;
        style?: string;
    }>;
    fields?: Array<{ type: string; text: string }>;
}

export interface SlackConfig {
    botToken: string;
    signingSecret?: string;
    baseUrl?: string;
}

/**
 * Get Slack config for an organization
 */
export async function getSlackConfig(organizationId: string): Promise<SlackConfig | null> {
    const db = getDatabase();

    const workspace = await db.query.slackWorkspaces.findFirst({
        where: eq(schema.slackWorkspaces.teamId, organizationId),
    });

    if (!workspace || !workspace.botAccessToken) {
        return null;
    }

    return {
        botToken: workspace.botAccessToken,
        baseUrl: "https://slack.com/api",
    };
}

/**
 * Send a message to Slack
 */
export async function sendSlackMessage(
    config: SlackConfig,
    message: SlackMessage
): Promise<{ ok: boolean; error?: string; ts?: string }> {
    try {
        const response = await fetch(`${config.baseUrl || "https://slack.com/api"}/chat.postMessage`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.botToken}`,
            },
            body: JSON.stringify(message),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error("Slack API error:", data.error);
            return { ok: false, error: data.error };
        }

        return { ok: true, ts: data.ts };
    } catch (error) {
        console.error("Failed to send Slack message:", error);
        return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}

/**
 * Send a PR notification to Slack
 */
export async function notifyPrEvent(
    organizationId: string,
    repositoryId: string,
    event: "opened" | "merged" | "closed" | "review_requested" | "approved" | "changes_requested",
    pr: {
        number: number;
        title: string;
        url: string;
        author: string;
        baseBranch: string;
        headBranch: string;
    },
    extra?: {
        reviewer?: string;
        comment?: string;
    }
): Promise<void> {
    const db = getDatabase();
    const config = await getSlackConfig(organizationId);

    if (!config) {
        logger.debug({ organizationId }, "No Slack config found for organization");
        return;
    }

    // Get channel mappings for this repo
    const mappings = await db.query.slackChannelMappings.findMany({
        where: and(
            eq(schema.slackChannelMappings.repositoryId, repositoryId),
            eq(schema.slackChannelMappings.isActive, true),
        ),
    });

    if (mappings.length === 0) {
        logger.debug({ repositoryId }, "No Slack channel mappings for repository");
        return;
    }

    // Create message based on event type
    const message = createPrEventMessage(event, pr, extra);

    // Send to all mapped channels
    for (const mapping of mappings) {
        // Check if this event type should be sent
        const notifyEvents = mapping.notifyOn as string[] | null;
        if (notifyEvents && !notifyEvents.includes(event)) {
            continue;
        }

        await sendSlackMessage(config, {
            channel: mapping.channelId,
            ...message,
        });
    }
}

/**
 * Create a PR event message with blocks
 */
function createPrEventMessage(
    event: string,
    pr: {
        number: number;
        title: string;
        url: string;
        author: string;
        baseBranch: string;
        headBranch: string;
    },
    extra?: {
        reviewer?: string;
        comment?: string;
    }
): { text: string; blocks: SlackBlock[] } {
    const eventEmoji: Record<string, string> = {
        opened: "🆕",
        merged: "🟣",
        closed: "🔴",
        review_requested: "👀",
        approved: "✅",
        changes_requested: "⚠️",
    };

    const eventText: Record<string, string> = {
        opened: `opened a new PR`,
        merged: `merged a PR`,
        closed: `closed a PR`,
        review_requested: `requested review from ${extra?.reviewer || "someone"}`,
        approved: `approved a PR`,
        changes_requested: `requested changes on a PR`,
    };

    const emoji = eventEmoji[event] || "📝";
    const action = eventText[event] || event;
    const text = `${emoji} *${pr.author}* ${action}: <${pr.url}|#${pr.number} ${pr.title}>`;

    const blocks: SlackBlock[] = [
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text,
            },
        },
        {
            type: "context",
            elements: [
                {
                    type: "mrkdwn",
                    text: { type: "plain_text", text: `\`${pr.headBranch}\` 2192 \`${pr.baseBranch}\`` },
                },
            ],
        },
    ];

    // Add comment if present
    if (extra?.comment) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `> ${extra.comment.substring(0, 200)}${extra.comment.length > 200 ? "..." : ""}`,
            },
        });
    }

    // Add action buttons
    blocks.push({
        type: "actions",
        elements: [
            {
                type: "button",
                text: {
                    type: "plain_text",
                    text: "View PR",
                    emoji: true,
                },
                url: pr.url,
                action_id: "view_pr",
            },
        ],
    });

    return {
        text: `${pr.author} ${action}: #${pr.number} ${pr.title}`,
        blocks,
    };
}

/**
 * Send a DM to a user about a PR event
 */
export async function notifyUserDm(
    userId: string,
    event: string,
    message: string,
    url?: string
): Promise<void> {
    const db = getDatabase();

    // Get user's Slack mapping
    const userMapping = await db.query.slackUserMappings.findFirst({
        where: eq(schema.slackUserMappings.userId, userId),
    });

    if (!userMapping || !userMapping.slackUserId || !userMapping.isActive) {
        return;
    }

    // Get workspace config
    const workspace = await db.query.slackWorkspaces.findFirst({
        where: eq(schema.slackWorkspaces.id, userMapping.workspaceId),
    });

    if (!workspace || !workspace.botAccessToken) {
        return;
    }

    const blocks: SlackBlock[] = [
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: message,
            },
        },
    ];

    if (url) {
        blocks.push({
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: { type: "plain_text", text: "View", emoji: true },
                    url,
                    action_id: "view_item",
                },
            ],
        });
    }

    await sendSlackMessage(
        { botToken: workspace.botAccessToken },
        {
            channel: userMapping.slackUserId,
            text: message,
            blocks,
        }
    );
}

/**
 * Notify about merge queue status
 */
export async function notifyMergeQueueStatus(
    organizationId: string,
    repositoryId: string,
    status: {
        position: number;
        total: number;
        prNumber: number;
        estimatedMerge?: string;
    }
): Promise<void> {
    const config = await getSlackConfig(organizationId);
    if (!config) return;

    const db = getDatabase();
    const mappings = await db.query.slackChannelMappings.findMany({
        where: and(
            eq(schema.slackChannelMappings.repositoryId, repositoryId),
            eq(schema.slackChannelMappings.isActive, true),
        ),
    });

    const text = `📋 PR #${status.prNumber} is #${status.position} of ${status.total} in merge queue${status.estimatedMerge ? ` (est. ${status.estimatedMerge})` : ""
        }`;

    for (const mapping of mappings) {
        await sendSlackMessage(config, {
            channel: mapping.channelId,
            text,
        });
    }
}
