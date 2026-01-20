/**
 * Issues Schema - Drizzle ORM
 * Defines issues, labels, milestones, and comments
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const issues = pgTable("issues", {
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
  isPinned: boolean("is_pinned").default(false),
  isLocked: boolean("is_locked").default(false),
  lockReason: text("lock_reason"),
  commentCount: integer("comment_count").default(0),
  reactions: text("reactions"), // JSON { +1, -1, laugh, heart, etc. }
  closedAt: timestamp("closed_at"),
  closedById: text("closed_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const issueComments = pgTable("issue_comments", {
  id: text("id").primaryKey(),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  reactions: text("reactions"), // JSON
  isEdited: boolean("is_edited").default(false),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const labels = pgTable("labels", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6b7280"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const issueLabels = pgTable("issue_labels", {
  id: text("id").primaryKey(),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  labelId: text("label_id")
    .notNull()
    .references(() => labels.id, { onDelete: "cascade" }),
});

export const milestones = pgTable("milestones", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  state: text("state").notNull().default("open"), // open, closed
  dueDate: timestamp("due_date"),
  openIssueCount: integer("open_issue_count").default(0),
  closedIssueCount: integer("closed_issue_count").default(0),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const issueAssignees = pgTable("issue_assignees", {
  id: text("id").primaryKey(),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

export const issueSubscribers = pgTable("issue_subscribers", {
  id: text("id").primaryKey(),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subscribedAt: timestamp("subscribed_at").notNull().defaultNow(),
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
