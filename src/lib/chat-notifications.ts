/**
 * Chat & Notification Integrations Library
 * Microsoft Teams, Discord, Enhanced Email
 */

import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and, gte, inArray, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";
import { sendEmail as sendPlatformEmail } from "./email";

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
    const db = getDatabase();
    const now = new Date();
    const from = new Date(now);
    if (options.period === "daily") {
        from.setDate(from.getDate() - 1);
    } else {
        from.setDate(from.getDate() - 7);
    }

    const whereClauses = [
        eq(schema.notifications.userId, options.userId),
        gte(schema.notifications.createdAt, from),
        eq(schema.notifications.isArchived, false),
    ];

    if (options.includeEvents.length > 0) {
        whereClauses.push(inArray(schema.notifications.type, options.includeEvents));
    }

    const notifications = await db.query.notifications.findMany({
        where: and(...whereClauses),
        orderBy: [desc(schema.notifications.createdAt)],
        with: {
            repository: true,
            actor: true,
        },
        limit: 50,
    });

    const periodLabel = options.period === "daily" ? "Daily" : "Weekly";
    const itemCount = notifications.length;
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    const eventCounts = new Map<string, number>();
    for (const n of notifications) {
        eventCounts.set(n.type, (eventCounts.get(n.type) || 0) + 1);
    }

    const escapeHtml = (value: string) =>
        value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    const subject = `Your ${periodLabel} OpenCodeHub Digest`;

    const summaryItems = Array.from(eventCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([event, count]) => `<li><strong>${count}</strong> ${escapeHtml(formatEventName(event as NotificationEvent))}</li>`)
        .join("");

    const itemRows = notifications
        .slice(0, 20)
        .map((n) => {
            const title = escapeHtml(n.title);
            const body = escapeHtml(n.body || "");
            const repo = n.repository?.name ? ` in ${escapeHtml(n.repository.name)}` : "";
            const actor = n.actor?.username ? ` by ${escapeHtml(n.actor.username)}` : "";
            const url = n.url || "#";
            const createdAt = n.createdAt.toISOString().replace("T", " ").slice(0, 16);

            return `
            <div class="item">
                <div class="item-icon">•</div>
                <div class="item-content">
                    <div><a href="${escapeHtml(url)}" style="color:#111;text-decoration:none;"><strong>${title}</strong></a></div>
                    <div style="color:#666;font-size:13px;">${escapeHtml(formatEventName(n.type as NotificationEvent))}${repo}${actor}</div>
                    ${body ? `<div style="color:#444;font-size:13px;margin-top:4px;">${body}</div>` : ""}
                    <div style="color:#999;font-size:12px;margin-top:4px;">${createdAt}</div>
                </div>
            </div>`;
        })
        .join("");

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
            <p>${itemCount} notification${itemCount === 1 ? "" : "s"} (${unreadCount} unread)</p>
        </div>
        <div class="section">
            <h2>📬 Activity Summary</h2>
            ${summaryItems ? `<ul>${summaryItems}</ul>` : "<p>No notifications for this period.</p>"}
        </div>
        <div class="section">
            <h2>📝 Recent Items</h2>
            ${itemRows || "<p>No recent items.</p>"}
        </div>
        <div class="footer">
            <p>You're receiving this because you subscribed to ${options.period} digests.</p>
            <a href="#">Manage notification preferences</a>
        </div>
    </div>
</body>
</html>`;

    return { subject, html, itemCount };
}

function parseDigestTimeToUtcMinutes(value: string | null | undefined): number {
    const fallback = "09:00";
    const [hourRaw, minuteRaw] = (value || fallback).split(":");
    const hour = Number.parseInt(hourRaw || "9", 10);
    const minute = Number.parseInt(minuteRaw || "0", 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 9 * 60;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return 9 * 60;
    return hour * 60 + minute;
}

function normalizeDigestDay(value: number | null | undefined): number {
    if (!Number.isInteger(value)) return 1;
    const day = Number(value);
    if (day < 1 || day > 7) return 1;
    return day;
}

function normalizeDigestTimeZone(value: string | null | undefined): string {
    if (!value || typeof value !== "string") return "UTC";
    try {
        Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
        return value;
    } catch {
        return "UTC";
    }
}

function getIsoWeekdayFromShortName(value: string): number {
    const normalized = value.toLowerCase();
    const map: Record<string, number> = {
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7,
    };
    return map[normalized] ?? 1;
}

function getZonedDateParts(date: Date, timeZone: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    isoWeekday: number;
} {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        weekday: "short",
        hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find((part) => part.type === type)?.value || "";

    return {
        year: Number.parseInt(getPart("year"), 10),
        month: Number.parseInt(getPart("month"), 10),
        day: Number.parseInt(getPart("day"), 10),
        hour: Number.parseInt(getPart("hour"), 10),
        minute: Number.parseInt(getPart("minute"), 10),
        isoWeekday: getIsoWeekdayFromShortName(getPart("weekday")),
    };
}

function getDateKey(year: number, month: number, day: number): number {
    return year * 10000 + month * 100 + day;
}

function getMondayWeekStartKey(year: number, month: number, day: number, isoWeekday: number): number {
    const diffToMonday = isoWeekday - 1;
    const mondayUtc = new Date(Date.UTC(year, month - 1, day));
    mondayUtc.setUTCDate(mondayUtc.getUTCDate() - diffToMonday);
    return getDateKey(
        mondayUtc.getUTCFullYear(),
        mondayUtc.getUTCMonth() + 1,
        mondayUtc.getUTCDate()
    );
}

export function shouldSendDigestNow(
    digestType: "daily" | "weekly" | "none",
    digestTime: string | null | undefined,
    digestDay: number | null | undefined,
    lastSentAt: Date | null | undefined,
    now: Date,
    timezone: string | null | undefined = "UTC"
): boolean {
    if (digestType === "none") return false;

    const timeZone = normalizeDigestTimeZone(timezone);
    const nowParts = getZonedDateParts(now, timeZone);
    const nowMinutes = nowParts.hour * 60 + nowParts.minute;
    const dueMinutes = parseDigestTimeToUtcMinutes(digestTime);
    if (nowMinutes < dueMinutes) return false;

    if (digestType === "daily") {
        if (!lastSentAt) return true;
        const lastSentParts = getZonedDateParts(lastSentAt, timeZone);
        return getDateKey(lastSentParts.year, lastSentParts.month, lastSentParts.day)
            !== getDateKey(nowParts.year, nowParts.month, nowParts.day);
    }

    const configuredDay = normalizeDigestDay(digestDay); // 1 = Monday
    if (nowParts.isoWeekday !== configuredDay) return false;

    if (!lastSentAt) return true;
    const lastSentParts = getZonedDateParts(lastSentAt, timeZone);
    const lastSentDateKey = getDateKey(lastSentParts.year, lastSentParts.month, lastSentParts.day);
    const weekStartKey = getMondayWeekStartKey(nowParts.year, nowParts.month, nowParts.day, nowParts.isoWeekday);
    return lastSentDateKey < weekStartKey;
}

export interface DigestRunOptions {
    now?: Date;
    dryRun?: boolean;
    maxRetries?: number;
}

export interface DigestRunResult {
    checked: number;
    due: number;
    sent: number;
    skippedNoEmail: number;
    skippedEmpty: number;
    failed: number;
    retried: number;
    recovered: number;
}

export interface UserDigestRunOptions {
    userId: string;
    period?: "daily" | "weekly";
    now?: Date;
    dryRun?: boolean;
    maxRetries?: number;
}

export interface UserDigestRunResult {
    sent: boolean;
    dryRun: boolean;
    period: "daily" | "weekly";
    itemCount: number;
    reason?: "missing_user_or_email" | "empty_digest" | "send_failed" | "missing_digest_settings";
    attempts: number;
    recovered?: boolean;
    lastError?: string;
}

function normalizeRetryCount(value: number | undefined): number {
    if (typeof value !== "number" || Number.isNaN(value)) return 1;
    return Math.min(Math.max(Math.trunc(value), 0), 5);
}

export interface DigestDeliveryAttemptResult {
    sent: boolean;
    attempts: number;
    recovered: boolean;
    lastError?: string;
}

export async function sendDigestWithRetry(
    send: () => Promise<boolean>,
    maxRetries: number
): Promise<DigestDeliveryAttemptResult> {
    const retries = normalizeRetryCount(maxRetries);
    const maxAttempts = retries + 1;
    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const sent = await send();
            if (sent) {
                return {
                    sent: true,
                    attempts,
                    recovered: attempts > 1,
                };
            }
            lastError = "send_failed";
        } catch (error) {
            lastError = error instanceof Error ? error.message : "send_failed";
        }
    }

    return {
        sent: false,
        attempts,
        recovered: false,
        lastError,
    };
}

export async function runUserDigest(options: UserDigestRunOptions): Promise<UserDigestRunResult> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? true;
    const maxRetries = normalizeRetryCount(options.maxRetries);

    const setting = await db.query.emailDigestSettings.findFirst({
        where: eq(schema.emailDigestSettings.userId, options.userId),
    });
    if (!setting) {
        return {
            sent: false,
            dryRun,
            period: options.period || "daily",
            itemCount: 0,
            reason: "missing_digest_settings",
            attempts: 0,
        };
    }

    const period = options.period || ((setting.digestType as "daily" | "weekly" | "none") === "weekly" ? "weekly" : "daily");
    const user = await db.query.users.findFirst({
        where: eq(schema.users.id, options.userId),
        columns: { id: true, email: true, isActive: true },
    });
    if (!user || !user.isActive || !user.email) {
        return {
            sent: false,
            dryRun,
            period,
            itemCount: 0,
            reason: "missing_user_or_email",
            attempts: 0,
        };
    }

    const prefs = await db.query.notificationPreferences.findMany({
        where: and(
            eq(schema.notificationPreferences.userId, user.id),
            eq(schema.notificationPreferences.emailEnabled, true)
        ),
        columns: { eventType: true },
    });
    const includeEvents = prefs.map((p) => p.eventType as NotificationEvent);

    const digest = await generateDigestEmail({
        userId: user.id,
        period,
        includeEvents,
    });

    if (digest.itemCount === 0) {
        return {
            sent: false,
            dryRun,
            period,
            itemCount: 0,
            reason: "empty_digest",
            attempts: 0,
        };
    }

    let attempts = 0;
    let recovered = false;
    if (!dryRun) {
        const delivery = await sendDigestWithRetry(async () => {
            return sendPlatformEmail({
                to: user.email,
                subject: digest.subject,
                html: digest.html,
                text: `${digest.subject}\n\nYou have ${digest.itemCount} new notification(s).`,
            });
        }, maxRetries);
        if (!delivery.sent) {
            return {
                sent: false,
                dryRun,
                period,
                itemCount: digest.itemCount,
                reason: "send_failed",
                attempts: delivery.attempts,
                lastError: delivery.lastError,
            };
        }
        attempts = delivery.attempts;
        recovered = delivery.recovered;

        await db
            .update(schema.emailDigestSettings)
            .set({ lastSentAt: now, updatedAt: now })
            .where(eq(schema.emailDigestSettings.id, setting.id));
    }

    return {
        sent: true,
        dryRun,
        period,
        itemCount: digest.itemCount,
        attempts: dryRun ? 0 : attempts,
        recovered,
    };
}

export async function runDueDigests(options: DigestRunOptions = {}): Promise<DigestRunResult> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? false;
    const maxRetries = normalizeRetryCount(options.maxRetries);

    const result: DigestRunResult = {
        checked: 0,
        due: 0,
        sent: 0,
        skippedNoEmail: 0,
        skippedEmpty: 0,
        failed: 0,
        retried: 0,
        recovered: 0,
    };

    const settings = await db.query.emailDigestSettings.findMany({
        where: and(
            inArray(schema.emailDigestSettings.digestType, ["daily", "weekly"])
        ),
    });

    result.checked = settings.length;

    for (const setting of settings) {
        const digestType = (setting.digestType as "daily" | "weekly" | "none") || "none";
        if (digestType === "none") continue;
        const due = shouldSendDigestNow(
            digestType,
            setting.digestTime,
            setting.digestDay,
            setting.lastSentAt,
            now,
            setting.timezone
        );
        if (!due) continue;
        result.due++;

        try {
            const user = await db.query.users.findFirst({
                where: eq(schema.users.id, setting.userId),
                columns: { id: true, email: true, isActive: true },
            });

            if (!user || !user.isActive || !user.email) {
                result.skippedNoEmail++;
                if (!dryRun) {
                    await db
                        .update(schema.emailDigestSettings)
                        .set({ lastSentAt: now, updatedAt: now })
                        .where(eq(schema.emailDigestSettings.id, setting.id));
                }
                continue;
            }

            const prefs = await db.query.notificationPreferences.findMany({
                where: and(
                    eq(schema.notificationPreferences.userId, user.id),
                    eq(schema.notificationPreferences.emailEnabled, true)
                ),
                columns: { eventType: true },
            });
            const includeEvents = prefs.map((p) => p.eventType as NotificationEvent);

            const digest = await generateDigestEmail({
                userId: user.id,
                period: digestType,
                includeEvents,
            });

            if (digest.itemCount === 0) {
                result.skippedEmpty++;
                if (!dryRun) {
                    await db
                        .update(schema.emailDigestSettings)
                        .set({ lastSentAt: now, updatedAt: now })
                        .where(eq(schema.emailDigestSettings.id, setting.id));
                }
                continue;
            }

            if (!dryRun) {
                const delivery = await sendDigestWithRetry(async () => {
                    return sendPlatformEmail({
                        to: user.email,
                        subject: digest.subject,
                        html: digest.html,
                        text: `${digest.subject}\n\nYou have ${digest.itemCount} new notification(s).`,
                    });
                }, maxRetries);
                if (delivery.attempts > 1) {
                    result.retried += delivery.attempts - 1;
                }
                if (!delivery.sent) {
                    result.failed++;
                    logger.error({
                        userId: setting.userId,
                        digestSettingId: setting.id,
                        attempts: delivery.attempts,
                        lastError: delivery.lastError || "send_failed",
                    }, "Digest send retries exhausted");
                    continue;
                }
                if (delivery.recovered) {
                    result.recovered++;
                }

                await db
                    .update(schema.emailDigestSettings)
                    .set({ lastSentAt: now, updatedAt: now })
                    .where(eq(schema.emailDigestSettings.id, setting.id));
            }

            result.sent++;
        } catch (error) {
            result.failed++;
            logger.error({
                userId: setting.userId,
                digestSettingId: setting.id,
                error: error instanceof Error ? error.message : "Unknown error",
            }, "Digest send failed");
        }
    }

    return result;
}
