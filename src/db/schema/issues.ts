/**
 * Issues Schema - Drizzle ORM
 * Defines issues, labels, milestones, and comments
 */

import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const issues = sqliteTable("issues", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  state: text("state").notNull().default("open"), // open, closed
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  assigneeId: text("assignee_id").references(() => users.id),
  milestoneId: text("milestone_id"), // Reference added later in relations
  isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
  isLocked: integer("is_locked", { mode: "boolean" }).default(false),
  lockReason: text("lock_reason"),
  commentCount: integer("comment_count").default(0),
  reactions: text("reactions"), // JSON { +1, -1, laugh, heart, etc. }
  closedAt: text("closed_at"),
  closedById: text("closed_by_id").references(() => users.id),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const issueComments = sqliteTable("issue_comments", {
  id: text("id").primaryKey(),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  reactions: text("reactions"), // JSON
  isEdited: integer("is_edited", { mode: "boolean" }).default(false),
  editedAt: text("edited_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const labels = sqliteTable("labels", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6b7280"),
  description: text("description"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const issueLabels = sqliteTable("issue_labels", {
  id: text("id").primaryKey(),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  labelId: text("label_id")
    .notNull()
    .references(() => labels.id, { onDelete: "cascade" }),
});

export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  state: text("state").notNull().default("open"), // open, closed
  dueDate: text("due_date"),
  openIssueCount: integer("open_issue_count").default(0),
  closedIssueCount: integer("closed_issue_count").default(0),
  closedAt: text("closed_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const issueAssignees = sqliteTable("issue_assignees", {
  id: text("id").primaryKey(),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  assignedAt: text("assigned_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const issueSubscribers = sqliteTable("issue_subscribers", {
  id: text("id").primaryKey(),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subscribedAt: text("subscribed_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Relations
export const issuesRelations = relations(issues, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [issues.repositoryId],
    references: [repositories.id],
  }),
  author: one(users, {
    fields: [issues.authorId],
    references: [users.id],
  }),
  assignee: one(users, {
    fields: [issues.assigneeId],
    references: [users.id],
  }),
  comments: many(issueComments),
  labels: many(issueLabels),
  assignees: many(issueAssignees),
  subscribers: many(issueSubscribers),
}));

export const issueCommentsRelations = relations(issueComments, ({ one }) => ({
  issue: one(issues, {
    fields: [issueComments.issueId],
    references: [issues.id],
  }),
  author: one(users, {
    fields: [issueComments.authorId],
    references: [users.id],
  }),
}));

export const labelsRelations = relations(labels, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [labels.repositoryId],
    references: [repositories.id],
  }),
  issues: many(issueLabels),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [milestones.repositoryId],
    references: [repositories.id],
  }),
  issues: many(issues),
}));

export const issueLabelsRelations = relations(issueLabels, ({ one }) => ({
  issue: one(issues, {
    fields: [issueLabels.issueId],
    references: [issues.id],
  }),
  label: one(labels, {
    fields: [issueLabels.labelId],
    references: [labels.id],
  }),
}));

// Types
export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;
export type IssueComment = typeof issueComments.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
