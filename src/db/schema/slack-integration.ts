/**
 * Slack Integration Schema
 * Workspace connections, channel mappings, and notification preferences
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
// import { organizations } from "./organizations";
import { repositories } from "./repositories";
import { users } from "./users";

// Slack workspace connections
export const slackWorkspaces = pgTable("slack_workspaces", {
    id: text("id").primaryKey(),
    // organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }), // Removed as per instruction

    // Slack info
    teamId: text("team_id").notNull(), // Slack team/workspace ID
    teamName: text("team_name"),
    teamDomain: text("team_domain"),

    // Auth
    accessToken: text("access_token").notNull(),
    botUserId: text("bot_user_id"),
    botAccessToken: text("bot_access_token"),

    // Scopes
    scopes: text("scopes"), // JSON array of granted scopes

    // Installation
    installedById: text("installed_by_id")
        .notNull()
        .references(() => users.id),
    installedAt: timestamp("installed_at").notNull().defaultNow(),

    // Status
    isActive: boolean("is_active").default(true),
    lastUsedAt: timestamp("last_used_at"),
});

// Channel mappings - which repos notify which channels
export const slackChannelMappings = pgTable("slack_channel_mappings", {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
        .notNull()
        .references(() => slackWorkspaces.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),

    // Channel info
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name"),

    // Notification settings (JSON array)
    // ["pr_created", "pr_merged", "review_requested", "ci_failed", "ci_passed"]
    notifyOn: text("notify_on").default('["pr_created","pr_merged","review_requested","ci_failed"]'),

    // Filters
    notifyBranches: text("notify_branches"), // JSON: branch patterns to notify on
    notifyAuthors: text("notify_authors"), // JSON: specific user IDs or "all"

    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// User Slack mappings - for DMs
export const slackUserMappings = pgTable("slack_user_mappings", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
        .notNull()
        .references(() => slackWorkspaces.id, { onDelete: "cascade" }),

    // Slack user info
    slackUserId: text("slack_user_id").notNull(),
    slackUsername: text("slack_username"),

    // DM preferences (JSON)
    // { "review_requested": true, "pr_approved": true, "ci_failed": true, "mentions": true }
    dmPreferences: text("dm_preferences").default('{"review_requested":true,"pr_approved":true,"ci_failed":true}'),

    // Do not disturb
    dndEnabled: boolean("dnd_enabled").default(false),
    dndStart: text("dnd_start"), // HH:MM
    dndEnd: text("dnd_end"), // HH:MM
    dndTimezone: text("dnd_timezone"),

    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const slackWorkspacesRelations = relations(slackWorkspaces, ({ one, many }) => ({
    installedBy: one(users, {
        fields: [slackWorkspaces.installedById],
        references: [users.id],
    }),
    channelMappings: many(slackChannelMappings),
    userMappings: many(slackUserMappings),
}));

export const slackChannelMappingsRelations = relations(slackChannelMappings, ({ one }) => ({
    workspace: one(slackWorkspaces, {
        fields: [slackChannelMappings.workspaceId],
        references: [slackWorkspaces.id],
    }),
    repository: one(repositories, {
        fields: [slackChannelMappings.repositoryId],
        references: [repositories.id],
    }),
}));

export const slackUserMappingsRelations = relations(slackUserMappings, ({ one }) => ({
    user: one(users, {
        fields: [slackUserMappings.userId],
        references: [users.id],
    }),
    workspace: one(slackWorkspaces, {
        fields: [slackUserMappings.workspaceId],
        references: [slackWorkspaces.id],
    }),
}));

// Types
export type SlackWorkspace = typeof slackWorkspaces.$inferSelect;
export type NewSlackWorkspace = typeof slackWorkspaces.$inferInsert;
export type SlackChannelMapping = typeof slackChannelMappings.$inferSelect;
export type NewSlackChannelMapping = typeof slackChannelMappings.$inferInsert;
export type SlackUserMapping = typeof slackUserMappings.$inferSelect;
export type NewSlackUserMapping = typeof slackUserMappings.$inferInsert;
