/**
 * Pull Requests Schema - Drizzle ORM
 * Defines pull requests, reviews, and review comments
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { labels, milestones } from "./issues";
import { repositories } from "./repositories";
import { users } from "./users";

export const pullRequests = pgTable("pull_requests", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  state: text("state").notNull().default("open"), // open, closed, merged
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  assigneeId: text("assignee_id").references(() => users.id),
  milestoneId: text("milestone_id"), // Reference handled in relations

  // Source and target
  headBranch: text("head_branch").notNull(),
  headSha: text("head_sha").notNull(),
  headRepositoryId: text("head_repository_id").references(
    () => repositories.id
  ),
  baseBranch: text("base_branch").notNull(),
  baseSha: text("base_sha").notNull(),

  // Merge info
  isDraft: boolean("is_draft").default(false),
  isMerged: boolean("is_merged").default(false),
  mergedAt: timestamp("merged_at"),
  mergedById: text("merged_by_id").references(() => users.id),
  mergeCommitSha: text("merge_commit_sha"),
  mergeSha: text("merge_sha"),
  mergeMethod: text("merge_method"), // merge, squash, rebase

  // Stats
  additions: integer("additions").default(0),
  deletions: integer("deletions").default(0),
  changedFiles: integer("changed_files").default(0),
  commentCount: integer("comment_count").default(0),
  reviewCount: integer("review_count").default(0),

  // Status
  mergeable: boolean("mergeable"),
  mergeableState: text("mergeable_state"), // clean, dirty, blocked, unknown
  rebaseable: boolean("rebaseable"),

  // Settings
  maintainerCanModify: boolean("maintainer_can_modify").default(true),
  allowAutoMerge: boolean("allow_auto_merge").default(false),
  autoMergeMethod: text("auto_merge_method"),

  closedAt: timestamp("closed_at"),
  closedById: text("closed_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pullRequestReviews = pgTable("pull_request_reviews", {
  id: text("id").primaryKey(),
  pullRequestId: text("pull_request_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id")
    .notNull()
    .references(() => users.id),
  state: text("state").notNull(), // pending, approved, changes_requested, commented, dismissed
  body: text("body"),
  commitSha: text("commit_sha"),
  submittedAt: timestamp("submitted_at"),
  dismissedAt: timestamp("dismissed_at"),
  dismissedById: text("dismissed_by_id").references(() => users.id),
  dismissalReason: text("dismissal_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pullRequestComments = pgTable("pull_request_comments", {
  id: text("id").primaryKey(),
  pullRequestId: text("pull_request_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  reviewId: text("review_id").references(() => pullRequestReviews.id),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  path: text("path"), // File path for inline comments
  line: integer("line"), // Line number
  side: text("side"), // LEFT, RIGHT
  startLine: integer("start_line"),
  startSide: text("start_side"),
  commitSha: text("commit_sha"),
  originalCommitSha: text("original_commit_sha"),
  originalLine: integer("original_line"),
  inReplyToId: text("in_reply_to_id").references((): any => pullRequestComments.id),
  reactions: text("reactions"), // JSON
  isResolved: boolean("is_resolved").default(false),
  resolvedById: text("resolved_by_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  isEdited: boolean("is_edited").default(false),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pullRequestLabels = pgTable("pull_request_labels", {
  id: text("id").primaryKey(),
  pullRequestId: text("pull_request_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  labelId: text("label_id")
    .notNull()
    .references(() => labels.id, { onDelete: "cascade" }),
});

export const pullRequestAssignees = pgTable("pull_request_assignees", {
  id: text("id").primaryKey(),
  pullRequestId: text("pull_request_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

export const pullRequestReviewers = pgTable("pull_request_reviewers", {
  id: text("id").primaryKey(),
  pullRequestId: text("pull_request_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  isRequired: boolean("is_required").default(false),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
});

export const pullRequestChecks = pgTable("pull_request_checks", {
  id: text("id").primaryKey(),
  pullRequestId: text("pull_request_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull(), // queued, in_progress, completed
  conclusion: text("conclusion"), // success, failure, neutral, cancelled, timed_out, action_required
  headSha: text("head_sha").notNull(),
  externalId: text("external_id"),
  detailsUrl: text("details_url"),
  output: text("output"), // JSON { title, summary, text }
  startedAt: timestamp("started_at"),
});

// Relations
export const pullRequestsRelations = relations(
  pullRequests,
  ({ one, many }) => ({
    repository: one(repositories, {
      fields: [pullRequests.repositoryId],
      references: [repositories.id],
    }),
    headRepository: one(repositories, {
      fields: [pullRequests.headRepositoryId],
      references: [repositories.id],
    }),
    author: one(users, {
      fields: [pullRequests.authorId],
      references: [users.id],
    }),
    assignee: one(users, {
      fields: [pullRequests.assigneeId],
      references: [users.id],
    }),
    // milestone: one(milestones, { // Removed because milestoneId has no foreign key
    //   fields: [pullRequests.milestoneId],
    //   references: [milestones.id],
    // }),
    mergedBy: one(users, {
      fields: [pullRequests.mergedById],
      references: [users.id],
    }),
    reviews: many(pullRequestReviews),
    comments: many(pullRequestComments),
    labels: many(pullRequestLabels),
    assignees: many(pullRequestAssignees),
    reviewers: many(pullRequestReviewers),
    checks: many(pullRequestChecks),
  })
);

export const pullRequestReviewsRelations = relations(
  pullRequestReviews,
  ({ one, many }) => ({
    pullRequest: one(pullRequests, {
      fields: [pullRequestReviews.pullRequestId],
      references: [pullRequests.id],
    }),
    reviewer: one(users, {
      fields: [pullRequestReviews.reviewerId],
      references: [users.id],
    }),
    comments: many(pullRequestComments),
  })
);

export const pullRequestCommentsRelations = relations(
  pullRequestComments,
  ({ one }) => ({
    pullRequest: one(pullRequests, {
      fields: [pullRequestComments.pullRequestId],
      references: [pullRequests.id],
    }),
    review: one(pullRequestReviews, {
      fields: [pullRequestComments.reviewId],
      references: [pullRequestReviews.id],
    }),
    author: one(users, {
      fields: [pullRequestComments.authorId],
      references: [users.id],
    }),
  })
);

export const pullRequestLabelsRelations = relations(
  pullRequestLabels,
  ({ one }) => ({
    pullRequest: one(pullRequests, {
      fields: [pullRequestLabels.pullRequestId],
      references: [pullRequests.id],
    }),
    label: one(labels, {
      fields: [pullRequestLabels.labelId],
      references: [labels.id],
    }),
  })
);

export const pullRequestAssigneesRelations = relations(
  pullRequestAssignees,
  ({ one }) => ({
    pullRequest: one(pullRequests, {
      fields: [pullRequestAssignees.pullRequestId],
      references: [pullRequests.id],
    }),
    user: one(users, {
      fields: [pullRequestAssignees.userId],
      references: [users.id],
    }),
  })
);

export const pullRequestReviewersRelations = relations(
  pullRequestReviewers,
  ({ one }) => ({
    pullRequest: one(pullRequests, {
      fields: [pullRequestReviewers.pullRequestId],
      references: [pullRequests.id],
    }),
    user: one(users, {
      fields: [pullRequestReviewers.userId],
      references: [users.id],
    }),
  })
);

export const pullRequestChecksRelations = relations(
  pullRequestChecks,
  ({ one }) => ({
    pullRequest: one(pullRequests, {
      fields: [pullRequestChecks.pullRequestId],
      references: [pullRequests.id],
    }),
  })
);

// Types
export type PullRequest = typeof pullRequests.$inferSelect;
export type NewPullRequest = typeof pullRequests.$inferInsert;
export type PullRequestReview = typeof pullRequestReviews.$inferSelect;
export type PullRequestComment = typeof pullRequestComments.$inferSelect;
export type PullRequestCheck = typeof pullRequestChecks.$inferSelect;
