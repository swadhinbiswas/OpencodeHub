/**
 * Microsoft Teams Integration
 * Send notifications to Teams channels via Incoming Webhooks
 */

import { logger } from "../logger";

export interface TeamsMessageCard {
    "@type": "MessageCard";
    "@context": "http://schema.org/extensions";
    themeColor: string;
    summary: string;
    sections: TeamsSection[];
    potentialAction?: TeamsAction[];
}

interface TeamsSection {
    activityTitle?: string;
    activitySubtitle?: string;
    activityImage?: string;
    facts?: { name: string; value: string }[];
    markdown?: boolean;
    text?: string;
}

interface TeamsAction {
    "@type": "OpenUri" | "ActionCard";
    name: string;
    targets?: { os: string; uri: string }[];
}

// Theme colors for different event types
const THEME_COLORS = {
    success: "28a745",
    warning: "ffc107",
    error: "dc3545",
    info: "0078d4",
    neutral: "6c757d",
};

/**
 * Send a message to Teams via webhook
 */
export async function sendTeamsMessage(
    webhookUrl: string,
    card: TeamsMessageCard
): Promise<boolean> {
    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(card),
        });

        if (!response.ok) {
            logger.error({ status: response.status }, "Teams webhook failed");
            return false;
        }

        return true;
    } catch (error) {
        logger.error({ error }, "Failed to send Teams message");
        return false;
    }
}

/**
 * Create a PR notification card
 */
export function createPRCard(options: {
    action: "opened" | "merged" | "closed" | "review_requested";
    prTitle: string;
    prNumber: number;
    prUrl: string;
    author: string;
    authorAvatar?: string;
    repository: string;
    description?: string;
}): TeamsMessageCard {
    const colors: Record<string, string> = {
        opened: THEME_COLORS.info,
        merged: THEME_COLORS.success,
        closed: THEME_COLORS.neutral,
        review_requested: THEME_COLORS.warning,
    };

    const titles: Record<string, string> = {
        opened: "🆕 New Pull Request",
        merged: "✅ Pull Request Merged",
        closed: "❌ Pull Request Closed",
        review_requested: "👀 Review Requested",
    };

    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: colors[options.action] || THEME_COLORS.info,
        summary: `${titles[options.action]}: ${options.prTitle}`,
        sections: [
            {
                activityTitle: `**${titles[options.action]}**`,
                activitySubtitle: `${options.repository} #${options.prNumber}`,
                activityImage: options.authorAvatar,
                facts: [
                    { name: "Title", value: options.prTitle },
                    { name: "Author", value: options.author },
                ],
                markdown: true,
                text: options.description,
            },
        ],
        potentialAction: [
            {
                "@type": "OpenUri",
                name: "View Pull Request",
                targets: [{ os: "default", uri: options.prUrl }],
            },
        ],
    };
}

/**
 * Create an issue notification card
 */
export function createIssueCard(options: {
    action: "opened" | "closed" | "commented";
    issueTitle: string;
    issueNumber: number;
    issueUrl: string;
    author: string;
    authorAvatar?: string;
    repository: string;
    labels?: string[];
}): TeamsMessageCard {
    const colors: Record<string, string> = {
        opened: THEME_COLORS.info,
        closed: THEME_COLORS.success,
        commented: THEME_COLORS.neutral,
    };

    const titles: Record<string, string> = {
        opened: "🐛 New Issue",
        closed: "✅ Issue Closed",
        commented: "💬 New Comment",
    };

    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: colors[options.action] || THEME_COLORS.info,
        summary: `${titles[options.action]}: ${options.issueTitle}`,
        sections: [
            {
                activityTitle: `**${titles[options.action]}**`,
                activitySubtitle: `${options.repository} #${options.issueNumber}`,
                activityImage: options.authorAvatar,
                facts: [
                    { name: "Title", value: options.issueTitle },
                    { name: "Author", value: options.author },
                    ...(options.labels?.length
                        ? [{ name: "Labels", value: options.labels.join(", ") }]
                        : []),
                ],
                markdown: true,
            },
        ],
        potentialAction: [
            {
                "@type": "OpenUri",
                name: "View Issue",
                targets: [{ os: "default", uri: options.issueUrl }],
            },
        ],
    };
}

/**
 * Create a CI/CD status card
 */
export function createCICard(options: {
    status: "success" | "failure" | "pending" | "running";
    workflowName: string;
    repository: string;
    branch: string;
    commitSha: string;
    commitUrl: string;
    runUrl: string;
    duration?: string;
}): TeamsMessageCard {
    const colors: Record<string, string> = {
        success: THEME_COLORS.success,
        failure: THEME_COLORS.error,
        pending: THEME_COLORS.warning,
        running: THEME_COLORS.info,
    };

    const icons: Record<string, string> = {
        success: "✅",
        failure: "❌",
        pending: "⏳",
        running: "🔄",
    };

    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: colors[options.status],
        summary: `${icons[options.status]} ${options.workflowName}: ${options.status}`,
        sections: [
            {
                activityTitle: `**${icons[options.status]} Workflow ${options.status.charAt(0).toUpperCase() + options.status.slice(1)}**`,
                activitySubtitle: options.repository,
                facts: [
                    { name: "Workflow", value: options.workflowName },
                    { name: "Branch", value: options.branch },
                    { name: "Commit", value: options.commitSha.slice(0, 7) },
                    ...(options.duration ? [{ name: "Duration", value: options.duration }] : []),
                ],
                markdown: true,
            },
        ],
        potentialAction: [
            {
                "@type": "OpenUri",
                name: "View Run",
                targets: [{ os: "default", uri: options.runUrl }],
            },
            {
                "@type": "OpenUri",
                name: "View Commit",
                targets: [{ os: "default", uri: options.commitUrl }],
            },
        ],
    };
}
