/**
 * Notification Preferences Schema - Drizzle ORM
 * User notification settings per event type and channel
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { users } from "./users";

/**
 * Global notification preferences for a user
 */
export const notificationPreferences = pgTable("notification_preferences", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),

    // Event type
    eventType: text("event_type").notNull(), // mention, assign, review_request, ci, etc.

    // Channels
    emailEnabled: boolean("email_enabled").default(true),
    slackEnabled: boolean("slack_enabled").default(false),
    inAppEnabled: boolean("in_app_enabled").default(true),
    browserPushEnabled: boolean("browser_push_enabled").default(false),

    // Repository-specific override (null = global)
    repositoryId: text("repository_id")
        .references(() => repositories.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Event types:
 * - mention: @mentioned in comment
 * - assign: Assigned to issue/PR
 * - review_request: Review requested
 * - review_submitted: Review submitted on your PR
 * - pr_approved: Your PR was approved
 * - pr_changes_requested: Changes requested on your PR
 * - pr_merged: Your PR was merged
 * - pr_closed: Your PR was closed
 * - comment: New comment on your PR/issue
 * - ci_passed: CI passed on your PR
 * - ci_failed: CI failed on your PR
 * - merge_queue: Merge queue status update
 * - stack_update: Stack status change
 * - ai_review: AI review completed
 * - star: Repository starred
 * - watching: Activity on watched repo
 */

/**
 * Quiet hours configuration
 */
export const notificationQuietHours = pgTable("notification_quiet_hours", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    isEnabled: boolean("is_enabled").default(false),
    startTime: text("start_time").notNull().default("22:00"), // HH:MM format
    endTime: text("end_time").notNull().default("08:00"),
    timezone: text("timezone").notNull().default("UTC"),
    daysOfWeek: text("days_of_week").default("0,1,2,3,4,5,6"), // CSV of day numbers (0=Sunday)
    allowUrgent: boolean("allow_urgent").default(true), // Allow critical notifications
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Push notification subscriptions (for browser push)
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dhKey: text("p256dh_key").notNull(),
    authKey: text("auth_key").notNull(),
    userAgent: text("user_agent"),
    isActive: boolean("is_active").default(true),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Email notification digest settings
 */
export const emailDigestSettings = pgTable("email_digest_settings", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    digestType: text("digest_type").notNull().default("none"), // none, daily, weekly
    digestTime: text("digest_time").default("09:00"), // HH:MM
    digestDay: integer("digest_day").default(1), // Day of week for weekly (1=Monday)
    timezone: text("timezone").notNull().default("UTC"),
    lastSentAt: timestamp("last_sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Relations
export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
    user: one(users, {
        fields: [notificationPreferences.userId],
        references: [users.id],
    }),
    repository: one(repositories, {
        fields: [notificationPreferences.repositoryId],
        references: [repositories.id],
    }),
}));

export const notificationQuietHoursRelations = relations(notificationQuietHours, ({ one }) => ({
    user: one(users, {
        fields: [notificationQuietHours.userId],
        references: [users.id],
    }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
    user: one(users, {
        fields: [pushSubscriptions.userId],
        references: [users.id],
    }),
}));

export const emailDigestSettingsRelations = relations(emailDigestSettings, ({ one }) => ({
    user: one(users, {
        fields: [emailDigestSettings.userId],
        references: [users.id],
    }),
}));

// Types
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NotificationQuietHours = typeof notificationQuietHours.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type EmailDigestSettings = typeof emailDigestSettings.$inferSelect;

export type NotificationEventType =
    | "mention"
    | "assign"
    | "review_request"
    | "review_submitted"
    | "pr_approved"
    | "pr_changes_requested"
    | "pr_merged"
    | "pr_closed"
    | "comment"
    | "ci_passed"
    | "ci_failed"
    | "merge_queue"
    | "stack_update"
    | "ai_review"
    | "star"
    | "watching";
