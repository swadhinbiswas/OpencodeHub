/**
 * Inbox Sections Schema - Drizzle ORM
 * Custom inbox sections with user-defined filters (Graphite-style)
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Custom inbox sections allow users to create personalized PR views
 * Similar to Graphite's customizable inbox
 */
export const inboxSections = pgTable("inbox_sections", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"), // lucide icon name
    color: text("color"), // hex color
    filters: text("filters"), // JSON - filter configuration
    position: integer("position").notNull().default(0),
    isDefault: boolean("is_default").default(false),
    isCollapsed: boolean("is_collapsed").default(false),
    showCount: boolean("show_count").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Filter configuration structure:
 * {
 *   author: string[],      // filter by PR author usernames
 *   reviewer: string[],    // filter by requested reviewer
 *   label: string[],       // filter by labels
 *   repository: string[],  // filter by repo (owner/name)
 *   state: 'open' | 'closed' | 'merged' | 'draft',
 *   ciStatus: 'pending' | 'success' | 'failure',
 *   isAssignedToMe: boolean,
 *   isReviewRequested: boolean,
 *   hasMyReview: boolean,
 *   isInStack: boolean,
 *   updatedWithin: '1h' | '1d' | '1w' | '1m',
 *   excludeLabels: string[],
 *   excludeAuthors: string[],
 * }
 */

/**
 * Shared inbox sections for team collaboration
 */
export const sharedInboxSections = pgTable("shared_inbox_sections", {
    id: text("id").primaryKey(),
    sectionId: text("section_id")
        .notNull()
        .references(() => inboxSections.id, { onDelete: "cascade" }),
    sharedWithUserId: text("shared_with_user_id")
        .references(() => users.id, { onDelete: "cascade" }),
    sharedWithTeamId: text("shared_with_team_id"), // Team ID if shared with team
    permission: text("permission").notNull().default("view"), // view, edit
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const inboxSectionsRelations = relations(inboxSections, ({ one, many }) => ({
    user: one(users, {
        fields: [inboxSections.userId],
        references: [users.id],
    }),
    sharedWith: many(sharedInboxSections),
}));

export const sharedInboxSectionsRelations = relations(sharedInboxSections, ({ one }) => ({
    section: one(inboxSections, {
        fields: [sharedInboxSections.sectionId],
        references: [inboxSections.id],
    }),
    sharedWithUser: one(users, {
        fields: [sharedInboxSections.sharedWithUserId],
        references: [users.id],
    }),
}));

// Types
export type InboxSection = typeof inboxSections.$inferSelect;
export type SharedInboxSection = typeof sharedInboxSections.$inferSelect;

export interface InboxSectionFilters {
    author?: string[];
    reviewer?: string[];
    label?: string[];
    repository?: string[];
    state?: "open" | "closed" | "merged" | "draft";
    ciStatus?: "pending" | "success" | "failure";
    isAssignedToMe?: boolean;
    isReviewRequested?: boolean;
    hasMyReview?: boolean;
    isInStack?: boolean;
    updatedWithin?: "1h" | "1d" | "1w" | "1m";
    excludeLabels?: string[];
    excludeAuthors?: string[];
}
