/**
 * Activity Schema - Drizzle ORM
 * Defines activity feed, notifications, and audit logs
 */

import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
// import { organizations } from "./organizations"; // Removed to prevent circular dependency
import { repositories } from "./repositories";
import { users } from "./users";

export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  repositoryId: text("repository_id").references(() => repositories.id, {
    onDelete: "cascade",
  }),
  type: text("type").notNull(), // push, create_repo, create_branch, open_issue, open_pr, comment, star, fork, etc.
  action: text("action").notNull(), // created, updated, deleted, opened, closed, merged, etc.
  refType: text("ref_type"), // branch, tag
  refName: text("ref_name"),
  targetType: text("target_type"), // repository, issue, pull_request, comment, etc.
  targetId: text("target_id"),
  payload: text("payload"), // JSON - additional data
  isPublic: boolean("is_public").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  repositoryId: text("repository_id").references(() => repositories.id),
  type: text("type").notNull(), // mention, assign, review_request, ci_failed, etc.
  title: text("title").notNull(),
  body: text("body"),
  url: text("url"),
  actorId: text("actor_id").references(() => users.id),
  subjectType: text("subject_type"), // issue, pull_request, commit, etc.
  subjectId: text("subject_id"),
  reason: text("reason").notNull(), // mention, assign, subscribed, review_requested, etc.
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  isArchived: boolean("is_archived").default(false),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  repositoryId: text("repository_id").references(() => repositories.id),
  action: text("action").notNull(),
  actorType: text("actor_type").notNull().default("user"), // user, system, oauth_app
  actorId: text("actor_id"),
  actorIp: text("actor_ip"),
  actorUserAgent: text("actor_user_agent"),
  targetType: text("target_type"),
  targetId: text("target_id"),
  targetName: text("target_name"),
  data: text("data"), // JSON - before/after data
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const activitiesRelations = relations(activities, ({ one }) => ({
  user: one(users, {
    fields: [activities.userId],
    references: [users.id],
  }),
  repository: one(repositories, {
    fields: [activities.repositoryId],
    references: [repositories.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  repository: one(repositories, {
    fields: [notifications.repositoryId],
    references: [repositories.id],
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
  repository: one(repositories, {
    fields: [auditLogs.repositoryId],
    references: [repositories.id],
  }),
}));

// Types
export type Activity = typeof activities.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
