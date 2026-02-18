/**
 * Notification Preferences API
 * Save and retrieve user notification preferences
 */

import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, isNull } from "drizzle-orm";
import { getDatabase, schema } from "@/db";

// Generate a simple ID
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

type DigestType = "none" | "daily" | "weekly";

function normalizeDigestType(value: unknown): DigestType {
    if (value === "daily" || value === "weekly" || value === "none") return value;
    return "none";
}

function normalizeDigestTime(value: unknown): string {
    if (typeof value !== "string") return "09:00";
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return "09:00";
    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "09:00";
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "09:00";
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeDigestDay(value: unknown): number {
    if (!Number.isInteger(value)) return 1;
    const day = Number(value);
    if (day < 1 || day > 7) return 1;
    return day;
}

function normalizeTimeZone(value: unknown): string {
    if (typeof value !== "string" || !value) return "UTC";
    try {
        Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
        return value;
    } catch {
        return "UTC";
    }
}

export const POST: APIRoute = withErrorHandler(async ({ locals, request }) => {
    const user = locals.user;

    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    const body = await request.json();
    const { preferences, quietHours, digestSettings } = body;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Save notification preferences
    if (preferences) {
        for (const [eventType, settings] of Object.entries(preferences)) {
            const typedSettings = settings as {
                emailEnabled?: boolean;
                slackEnabled?: boolean;
                inAppEnabled?: boolean;
                browserPushEnabled?: boolean;
            };

            // Check if preference exists
            const existing = await db.query.notificationPreferences.findFirst({
                where: and(
                    eq(schema.notificationPreferences.userId, user.id),
                    eq(schema.notificationPreferences.eventType, eventType),
                    isNull(schema.notificationPreferences.repositoryId)
                ),
            });

            if (existing) {
                // Update existing
                await db
                    .update(schema.notificationPreferences)
                    .set({
                        emailEnabled: typedSettings.emailEnabled ?? true,
                        slackEnabled: typedSettings.slackEnabled ?? false,
                        inAppEnabled: typedSettings.inAppEnabled ?? true,
                        browserPushEnabled: typedSettings.browserPushEnabled ?? false,
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.notificationPreferences.id, existing.id));
            } else {
                // Create new
                await db.insert(schema.notificationPreferences).values({
                    id: generateId(),
                    userId: user.id,
                    eventType,
                    emailEnabled: typedSettings.emailEnabled ?? true,
                    slackEnabled: typedSettings.slackEnabled ?? false,
                    inAppEnabled: typedSettings.inAppEnabled ?? true,
                    browserPushEnabled: typedSettings.browserPushEnabled ?? false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }
        }
    }

    // Save quiet hours
    if (quietHours) {
        const existingQuietHours = await db.query.notificationQuietHours.findFirst({
            where: eq(schema.notificationQuietHours.userId, user.id),
        });

        if (existingQuietHours) {
            await db
                .update(schema.notificationQuietHours)
                .set({
                    isEnabled: quietHours.isEnabled ?? false,
                    startTime: quietHours.startTime || "22:00",
                    endTime: quietHours.endTime || "08:00",
                    allowUrgent: quietHours.allowUrgent ?? true,
                    updatedAt: new Date(),
                })
                .where(eq(schema.notificationQuietHours.id, existingQuietHours.id));
        } else {
            await db.insert(schema.notificationQuietHours).values({
                id: generateId(),
                userId: user.id,
                isEnabled: quietHours.isEnabled ?? false,
                startTime: quietHours.startTime || "22:00",
                endTime: quietHours.endTime || "08:00",
                timezone: "UTC",
                allowUrgent: quietHours.allowUrgent ?? true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
    }

    // Save digest settings
    if (digestSettings) {
        const digestType = normalizeDigestType(digestSettings.digestType);
        const digestTime = normalizeDigestTime(digestSettings.digestTime);
        const digestDay = normalizeDigestDay(digestSettings.digestDay);
        const timezone = normalizeTimeZone(digestSettings.timezone);

        const existingDigest = await db.query.emailDigestSettings.findFirst({
            where: eq(schema.emailDigestSettings.userId, user.id),
        });

        if (existingDigest) {
            await db
                .update(schema.emailDigestSettings)
                .set({
                    digestType,
                    digestTime,
                    digestDay,
                    timezone,
                    updatedAt: new Date(),
                })
                .where(eq(schema.emailDigestSettings.id, existingDigest.id));
        } else {
            await db.insert(schema.emailDigestSettings).values({
                id: generateId(),
                userId: user.id,
                digestType,
                digestTime,
                digestDay,
                timezone,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
    }

    logger.info({ userId: user.id }, "Notification preferences updated");

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
});

export const GET: APIRoute = withErrorHandler(async ({ locals }) => {
    const user = locals.user;

    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get all preferences
    const preferences = await db.query.notificationPreferences.findMany({
        where: and(
            eq(schema.notificationPreferences.userId, user.id),
            isNull(schema.notificationPreferences.repositoryId)
        ),
    });

    // Get quiet hours
    const quietHours = await db.query.notificationQuietHours.findFirst({
        where: eq(schema.notificationQuietHours.userId, user.id),
    });

    // Get digest settings
    const digestSettings = await db.query.emailDigestSettings.findFirst({
        where: eq(schema.emailDigestSettings.userId, user.id),
    });

    return new Response(
        JSON.stringify({
            preferences: preferences.reduce((acc, p) => {
                acc[p.eventType] = {
                    emailEnabled: p.emailEnabled,
                    slackEnabled: p.slackEnabled,
                    inAppEnabled: p.inAppEnabled,
                    browserPushEnabled: p.browserPushEnabled,
                };
                return acc;
            }, {} as Record<string, unknown>),
            quietHours: quietHours
                ? {
                    isEnabled: quietHours.isEnabled,
                    startTime: quietHours.startTime,
                    endTime: quietHours.endTime,
                    allowUrgent: quietHours.allowUrgent,
                }
                : null,
            digestSettings: digestSettings
                ? {
                    digestType: digestSettings.digestType,
                    digestTime: digestSettings.digestTime,
                    digestDay: digestSettings.digestDay,
                    timezone: digestSettings.timezone,
                }
                : null,
        }),
        {
            status: 200,
            headers: { "Content-Type": "application/json" },
        }
    );
});
