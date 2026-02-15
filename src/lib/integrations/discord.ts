/**
 * Discord Integration
 * Send notifications to Discord channels via Webhooks
 */

import { logger } from "../logger";

export interface DiscordEmbed {
    title?: string;
    description?: string;
    url?: string;
    timestamp?: string;
    color?: number;
    footer?: { text: string; icon_url?: string };
    author?: { name: string; url?: string; icon_url?: string };
    fields?: { name: string; value: string; inline?: boolean }[];
    thumbnail?: { url: string };
}

export interface DiscordWebhookPayload {
    content?: string;
    username?: string;
    avatar_url?: string;
    embeds?: DiscordEmbed[];
}

// Discord colors (decimal format)
const COLORS = {
    success: 0x28a745,
    warning: 0xffc107,
    error: 0xdc3545,
    info: 0x5865f2,
    neutral: 0x6c757d,
    purple: 0x9b59b6,
};

/**
 * Send a message to Discord via webhook
 */
export async function sendDiscordMessage(
    webhookUrl: string,
    payload: DiscordWebhookPayload
): Promise<boolean> {
    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const error = await response.text();
            logger.error({ status: response.status, error }, "Discord webhook failed");
            return false;
        }

        return true;
    } catch (error) {
        logger.error({ error }, "Failed to send Discord message");
        return false;
    }
}

/**
 * Create a PR notification embed
 */
export function createPREmbed(options: {
    action: "opened" | "merged" | "closed" | "review_requested";
    prTitle: string;
    prNumber: number;
    prUrl: string;
    author: string;
    authorAvatar?: string;
    repository: string;
    description?: string;
    additions?: number;
    deletions?: number;
}): DiscordEmbed {
    const colors: Record<string, number> = {
        opened: COLORS.info,
        merged: COLORS.success,
        closed: COLORS.neutral,
        review_requested: COLORS.warning,
    };

    const titles: Record<string, string> = {
        opened: "🆕 Pull Request Opened",
        merged: "✅ Pull Request Merged",
        closed: "❌ Pull Request Closed",
        review_requested: "👀 Review Requested",
    };

    const fields: DiscordEmbed["fields"] = [];

    if (options.additions !== undefined && options.deletions !== undefined) {
        fields.push({
            name: "Changes",
            value: `+${options.additions} / -${options.deletions}`,
            inline: true,
        });
    }

    return {
        title: `${titles[options.action]}`,
        description: `**[#${options.prNumber} ${options.prTitle}](${options.prUrl})**\n\n${options.description || ""}`,
        url: options.prUrl,
        color: colors[options.action],
        author: {
            name: options.author,
            icon_url: options.authorAvatar,
        },
        footer: {
            text: options.repository,
        },
        timestamp: new Date().toISOString(),
        fields,
    };
}

/**
 * Create an issue notification embed
 */
export function createIssueEmbed(options: {
    action: "opened" | "closed" | "commented" | "labeled";
    issueTitle: string;
    issueNumber: number;
    issueUrl: string;
    author: string;
    authorAvatar?: string;
    repository: string;
    labels?: string[];
    body?: string;
}): DiscordEmbed {
    const colors: Record<string, number> = {
        opened: COLORS.info,
        closed: COLORS.success,
        commented: COLORS.neutral,
        labeled: COLORS.purple,
    };

    const titles: Record<string, string> = {
        opened: "🐛 Issue Opened",
        closed: "✅ Issue Closed",
        commented: "💬 New Comment",
        labeled: "🏷️ Issue Labeled",
    };

    const fields: DiscordEmbed["fields"] = [];

    if (options.labels?.length) {
        fields.push({
            name: "Labels",
            value: options.labels.map(l => `\`${l}\``).join(" "),
            inline: true,
        });
    }

    return {
        title: titles[options.action],
        description: `**[#${options.issueNumber} ${options.issueTitle}](${options.issueUrl})**\n\n${options.body?.slice(0, 200) || ""}`,
        url: options.issueUrl,
        color: colors[options.action],
        author: {
            name: options.author,
            icon_url: options.authorAvatar,
        },
        footer: {
            text: options.repository,
        },
        timestamp: new Date().toISOString(),
        fields,
    };
}

/**
 * Create a CI/CD status embed
 */
export function createCIEmbed(options: {
    status: "success" | "failure" | "pending" | "running" | "cancelled";
    workflowName: string;
    repository: string;
    branch: string;
    commitSha: string;
    commitMessage?: string;
    runUrl: string;
    duration?: string;
    triggeredBy?: string;
}): DiscordEmbed {
    const colors: Record<string, number> = {
        success: COLORS.success,
        failure: COLORS.error,
        pending: COLORS.warning,
        running: COLORS.info,
        cancelled: COLORS.neutral,
    };

    const icons: Record<string, string> = {
        success: "✅",
        failure: "❌",
        pending: "⏳",
        running: "🔄",
        cancelled: "⏹️",
    };

    return {
        title: `${icons[options.status]} Workflow: ${options.status.charAt(0).toUpperCase() + options.status.slice(1)}`,
        description: `**${options.workflowName}**`,
        url: options.runUrl,
        color: colors[options.status],
        fields: [
            { name: "Branch", value: `\`${options.branch}\``, inline: true },
            { name: "Commit", value: `\`${options.commitSha.slice(0, 7)}\``, inline: true },
            ...(options.duration ? [{ name: "Duration", value: options.duration, inline: true }] : []),
            ...(options.commitMessage ? [{ name: "Message", value: options.commitMessage.slice(0, 100) }] : []),
        ],
        footer: {
            text: options.repository,
        },
        timestamp: new Date().toISOString(),
    };
}

/**
 * Create a push notification embed
 */
export function createPushEmbed(options: {
    repository: string;
    branch: string;
    pusher: string;
    pusherAvatar?: string;
    commits: { sha: string; message: string; url: string }[];
    compareUrl: string;
}): DiscordEmbed {
    const commitList = options.commits
        .slice(0, 5)
        .map(c => `[\`${c.sha.slice(0, 7)}\`](${c.url}) ${c.message.split("\n")[0].slice(0, 50)}`)
        .join("\n");

    const moreCommits = options.commits.length > 5
        ? `\n... and ${options.commits.length - 5} more`
        : "";

    return {
        title: `📤 ${options.commits.length} commit${options.commits.length > 1 ? "s" : ""} pushed to \`${options.branch}\``,
        description: commitList + moreCommits,
        url: options.compareUrl,
        color: COLORS.info,
        author: {
            name: options.pusher,
            icon_url: options.pusherAvatar,
        },
        footer: {
            text: options.repository,
        },
        timestamp: new Date().toISOString(),
    };
}

/**
 * Create a release notification embed
 */
export function createReleaseEmbed(options: {
    action: "published" | "prereleased" | "released";
    name: string;
    tagName: string;
    repository: string;
    releaseUrl: string;
    body?: string;
    author: string;
    authorAvatar?: string;
    isPrerelease: boolean;
}): DiscordEmbed {
    return {
        title: `🚀 Release ${options.isPrerelease ? "(Pre-release)" : ""}: ${options.name}`,
        description: options.body?.slice(0, 500) || "No release notes provided.",
        url: options.releaseUrl,
        color: options.isPrerelease ? COLORS.warning : COLORS.success,
        author: {
            name: options.author,
            icon_url: options.authorAvatar,
        },
        fields: [
            { name: "Tag", value: `\`${options.tagName}\``, inline: true },
        ],
        footer: {
            text: options.repository,
        },
        timestamp: new Date().toISOString(),
    };
}
