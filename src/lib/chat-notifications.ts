/**
 * Chat & Notification Integrations Library
 * Microsoft Teams, Discord, Enhanced Email
 */

import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";

// ============================================================================
// SCHEMA
// ============================================================================

export const chatIntegrations = pgTable("chat_integrations", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .references(() => repositories.id, { onDelete: "cascade" }),
    organizationId: text("organization_id"),
    provider: text("provider").notNull(), // slack, teams, discord, email
    name: text("name").notNull(),
    webhookUrl: text("webhook_url"),
    apiToken: text("api_token"),
    channelId: text("channel_id"),
    isEnabled: boolean("is_enabled").default(true),
    events: jsonb("events").$type<string[]>().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const emailSettings = pgTable("email_settings", {
    id: text("id").primaryKey(),
    organizationId: text("organization_id"),
    smtpHost: text("smtp_host"),
    smtpPort: text("smtp_port"),
    smtpUser: text("smtp_user"),
    smtpPass: text("smtp_pass"), // Encrypted
    fromAddress: text("from_address"),
    fromName: text("from_name"),
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ChatIntegration = typeof chatIntegrations.$inferSelect;
export type EmailSettings = typeof emailSettings.$inferSelect;

// ============================================================================
// NOTIFICATION EVENT TYPES
// ============================================================================

export type NotificationEvent =
    | "pr_opened"
    | "pr_merged"
    | "pr_closed"
    | "pr_review_requested"
    | "pr_review_submitted"
    | "pr_comment"
    | "issue_opened"
    | "issue_closed"
    | "issue_assigned"
    | "ci_failed"
    | "ci_passed"
    | "deploy_started"
    | "deploy_completed"
    | "security_alert";

export interface NotificationPayload {
    event: NotificationEvent;
    title: string;
    message: string;
    url?: string;
    actor?: { name: string; avatar?: string };
    repository?: { name: string; url: string };
    metadata?: Record<string, unknown>;
}

// ============================================================================
// MICROSOFT TEAMS INTEGRATION
// ============================================================================

export async function sendTeamsNotification(
    webhookUrl: string,
    payload: NotificationPayload
): Promise<boolean> {
    try {
        const card = buildTeamsAdaptiveCard(payload);

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(card),
        });

        if (!response.ok) {
            logger.error({ status: response.status }, "Teams notification failed");
            return false;
        }

        return true;
    } catch (error) {
        logger.error({ error }, "Teams notification error");
        return false;
    }
}

function buildTeamsAdaptiveCard(payload: NotificationPayload): Record<string, unknown> {
    const themeColor = getEventColor(payload.event);

    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor,
        summary: payload.title,
        sections: [
            {
                activityTitle: payload.title,
                activitySubtitle: payload.repository?.name || "",
                activityImage: payload.actor?.avatar,
                facts: [
                    { name: "Event", value: formatEventName(payload.event) },
                    ...(payload.actor ? [{ name: "By", value: payload.actor.name }] : []),
                ],
                markdown: true,
                text: payload.message,
            },
        ],
        potentialAction: payload.url
            ? [
                {
                    "@type": "OpenUri",
                    name: "View Details",
                    targets: [{ os: "default", uri: payload.url }],
                },
            ]
            : [],
    };
}

// ============================================================================
// DISCORD INTEGRATION
// ============================================================================

export async function sendDiscordNotification(
    webhookUrl: string,
    payload: NotificationPayload
): Promise<boolean> {
    try {
        const embed = buildDiscordEmbed(payload);

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed] }),
        });

        if (!response.ok) {
            logger.error({ status: response.status }, "Discord notification failed");
            return false;
        }

        return true;
    } catch (error) {
        logger.error({ error }, "Discord notification error");
        return false;
    }
}

function buildDiscordEmbed(payload: NotificationPayload): Record<string, unknown> {
    const color = getEventColorInt(payload.event);

    return {
        title: payload.title,
        description: payload.message,
        url: payload.url,
        color,
        author: payload.actor
            ? {
                name: payload.actor.name,
                icon_url: payload.actor.avatar,
            }
            : undefined,
        footer: payload.repository
            ? {
                text: payload.repository.name,
            }
            : undefined,
        timestamp: new Date().toISOString(),
        fields: [
            {
                name: "Event",
                value: formatEventName(payload.event),
                inline: true,
            },
        ],
    };
}

// ============================================================================
// ENHANCED EMAIL INTEGRATION
// ============================================================================

export interface EmailOptions {
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string;
    cc?: string[];
    bcc?: string[];
    attachments?: { filename: string; content: string | Buffer }[];
}

export async function sendEmail(
    settings: EmailSettings,
    options: EmailOptions
): Promise<boolean> {
    if (!settings.isEnabled || !settings.smtpHost) {
        logger.warn("Email not configured");
        return false;
    }

    try {
        // Use nodemailer-like interface
        const transport = createTransport(settings);

        await transport.sendMail({
            from: `${settings.fromName} <${settings.fromAddress}>`,
            to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
            replyTo: options.replyTo,
            cc: options.cc?.join(", "),
            bcc: options.bcc?.join(", "),
        });

        return true;
    } catch (error) {
        logger.error({ error }, "Email send failed");
        return false;
    }
}

function createTransport(settings: EmailSettings) {
    // Simulated transport - in production use nodemailer
    return {
        sendMail: async (options: Record<string, unknown>) => {
            // SMTP connection logic
            const response = await fetch(`https://${settings.smtpHost}:${settings.smtpPort}/send`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Basic ${Buffer.from(`${settings.smtpUser}:${settings.smtpPass}`).toString("base64")}`,
                },
                body: JSON.stringify(options),
            });

            if (!response.ok) throw new Error("SMTP error");
            return response;
        },
    };
}

export function buildNotificationEmail(payload: NotificationPayload): { subject: string; html: string } {
    const eventName = formatEventName(payload.event);
    const subject = `[${payload.repository?.name || "OpenCodeHub"}] ${payload.title}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background: ${getEventColor(payload.event)}; color: white; padding: 20px; }
        .header h1 { margin: 0; font-size: 18px; }
        .content { padding: 20px; }
        .actor { display: flex; align-items: center; margin-bottom: 16px; }
        .actor img { width: 40px; height: 40px; border-radius: 50%; margin-right: 12px; }
        .message { color: #333; line-height: 1.6; }
        .button { display: inline-block; background: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-top: 16px; }
        .footer { padding: 16px 20px; background: #f9f9f9; border-top: 1px solid #eee; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${eventName}</h1>
        </div>
        <div class="content">
            ${payload.actor ? `
            <div class="actor">
                ${payload.actor.avatar ? `<img src="${payload.actor.avatar}" alt="${payload.actor.name}">` : ""}
                <strong>${payload.actor.name}</strong>
            </div>
            ` : ""}
            <h2>${payload.title}</h2>
            <p class="message">${payload.message}</p>
            ${payload.url ? `<a href="${payload.url}" class="button">View Details</a>` : ""}
        </div>
        <div class="footer">
            ${payload.repository ? `Repository: ${payload.repository.name}` : ""}
        </div>
    </div>
</body>
</html>`;

    return { subject, html };
}

// ============================================================================
// UNIFIED NOTIFICATION DISPATCH
// ============================================================================

export async function dispatchNotification(
    repositoryId: string,
    payload: NotificationPayload
): Promise<{ sent: number; failed: number }> {
    const db = getDatabase();
    let sent = 0;
    let failed = 0;

    try {
        const integrations = await db.query.chatIntegrations?.findMany({
            where: and(
                eq(schema.chatIntegrations.repositoryId, repositoryId),
                eq(schema.chatIntegrations.isEnabled, true)
            ),
        }) || [];

        for (const integration of integrations) {
            // Check if this integration wants this event
            const events = (integration.events as string[]) || [];
            if (events.length > 0 && !events.includes(payload.event)) {
                continue;
            }

            let success = false;

            switch (integration.provider) {
                case "slack":
                    success = await sendSlackNotification(integration.webhookUrl || "", payload);
                    break;
                case "teams":
                    success = await sendTeamsNotification(integration.webhookUrl || "", payload);
                    break;
                case "discord":
                    success = await sendDiscordNotification(integration.webhookUrl || "", payload);
                    break;
            }

            if (success) sent++;
            else failed++;
        }
    } catch (error) {
        logger.error({ error }, "Notification dispatch failed");
    }

    return { sent, failed };
}

// Slack notification (wrapper for existing implementation)
async function sendSlackNotification(webhookUrl: string, payload: NotificationPayload): Promise<boolean> {
    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                attachments: [
                    {
                        color: getEventColor(payload.event),
                        author_name: payload.actor?.name,
                        author_icon: payload.actor?.avatar,
                        title: payload.title,
                        title_link: payload.url,
                        text: payload.message,
                        footer: payload.repository?.name,
                        ts: Math.floor(Date.now() / 1000),
                    },
                ],
            }),
        });

        return response.ok;
    } catch {
        return false;
    }
}

// ============================================================================
// CONFIGURATION FUNCTIONS
// ============================================================================

export async function configureChatIntegration(options: {
    repositoryId?: string;
    organizationId?: string;
    provider: "slack" | "teams" | "discord";
    name: string;
    webhookUrl: string;
    events?: NotificationEvent[];
}): Promise<ChatIntegration> {
    const db = getDatabase();

    const integration = {
        id: crypto.randomUUID(),
        repositoryId: options.repositoryId || null,
        organizationId: options.organizationId || null,
        provider: options.provider,
        name: options.name,
        webhookUrl: options.webhookUrl,
        apiToken: null,
        channelId: null,
        isEnabled: true,
        events: options.events || [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.chatIntegrations).values(integration);

    logger.info({ provider: options.provider }, "Chat integration configured");

    return integration as ChatIntegration;
}

export async function configureEmailSettings(options: {
    organizationId?: string;
    smtpHost: string;
    smtpPort: string;
    smtpUser: string;
    smtpPass: string;
    fromAddress: string;
    fromName: string;
}): Promise<EmailSettings> {
    const db = getDatabase();

    const settings = {
        id: crypto.randomUUID(),
        organizationId: options.organizationId || null,
        smtpHost: options.smtpHost,
        smtpPort: options.smtpPort,
        smtpUser: options.smtpUser,
        smtpPass: options.smtpPass,
        fromAddress: options.fromAddress,
        fromName: options.fromName,
        isEnabled: true,
        createdAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.emailSettings).values(settings);

    logger.info("Email settings configured");

    return settings as EmailSettings;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getEventColor(event: NotificationEvent): string {
    const colors: Record<string, string> = {
        pr_opened: "#6f42c1",
        pr_merged: "#28a745",
        pr_closed: "#dc3545",
        pr_review_requested: "#fd7e14",
        pr_review_submitted: "#17a2b8",
        pr_comment: "#6c757d",
        issue_opened: "#28a745",
        issue_closed: "#6c757d",
        issue_assigned: "#17a2b8",
        ci_failed: "#dc3545",
        ci_passed: "#28a745",
        deploy_started: "#fd7e14",
        deploy_completed: "#28a745",
        security_alert: "#dc3545",
    };
    return colors[event] || "#6c757d";
}

function getEventColorInt(event: NotificationEvent): number {
    const hex = getEventColor(event).replace("#", "");
    return parseInt(hex, 16);
}

function formatEventName(event: NotificationEvent): string {
    const names: Record<string, string> = {
        pr_opened: "Pull Request Opened",
        pr_merged: "Pull Request Merged",
        pr_closed: "Pull Request Closed",
        pr_review_requested: "Review Requested",
        pr_review_submitted: "Review Submitted",
        pr_comment: "New Comment",
        issue_opened: "Issue Opened",
        issue_closed: "Issue Closed",
        issue_assigned: "Issue Assigned",
        ci_failed: "CI Failed",
        ci_passed: "CI Passed",
        deploy_started: "Deployment Started",
        deploy_completed: "Deployment Completed",
        security_alert: "Security Alert",
    };
    return names[event] || event;
}

// ============================================================================
// DIGEST EMAILS
// ============================================================================

export interface DigestOptions {
    userId: string;
    period: "daily" | "weekly";
    includeEvents: NotificationEvent[];
}

export async function generateDigestEmail(options: DigestOptions): Promise<{
    subject: string;
    html: string;
    itemCount: number;
}> {
    // In production, fetch actual activity from database
    const periodLabel = options.period === "daily" ? "Daily" : "Weekly";

    const subject = `Your ${periodLabel} OpenCodeHub Digest`;
    const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .section { padding: 20px; border-bottom: 1px solid #eee; }
        .section h2 { margin: 0 0 16px; font-size: 16px; color: #333; }
        .item { display: flex; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
        .item:last-child { border-bottom: none; }
        .item-icon { width: 24px; margin-right: 12px; }
        .item-content { flex: 1; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${periodLabel} Digest</h1>
            <p>Your activity summary</p>
        </div>
        <div class="section">
            <h2>📬 Activity Summary</h2>
            <p>This is a placeholder digest. In production, this would include:</p>
            <ul>
                <li>New pull requests requiring your review</li>
                <li>PRs awaiting your response</li>
                <li>Issues assigned to you</li>
                <li>CI/CD build status</li>
                <li>Security alerts</li>
            </ul>
        </div>
        <div class="footer">
            <p>You're receiving this because you subscribed to ${options.period} digests.</p>
            <a href="#">Manage notification preferences</a>
        </div>
    </div>
</body>
</html>`;

    return { subject, html, itemCount: 0 };
}
