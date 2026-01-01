/**
 * Developer Metrics Schema
 * Track PR velocity, review efficiency, and team productivity
 */

import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pullRequests } from "./pull-requests";
import { repositories } from "./repositories";
import { users } from "./users";
import { organizations } from "./organizations";

// Per-PR metrics
export const prMetrics = sqliteTable("pr_metrics", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    authorId: text("author_id")
        .notNull()
        .references(() => users.id),

    // Time metrics (in seconds)
    timeToFirstReview: integer("time_to_first_review"),
    timeToApproval: integer("time_to_approval"),
    timeToMerge: integer("time_to_merge"),
    totalCycleTime: integer("total_cycle_time"), // First commit to merge

    // Review metrics
    reviewRounds: integer("review_rounds").default(1),
    reviewersCount: integer("reviewers_count").default(0),
    commentsCount: integer("comments_count").default(0),
    changesRequestedCount: integer("changes_requested_count").default(0),

    // Size metrics
    linesAdded: integer("lines_added").default(0),
    linesRemoved: integer("lines_removed").default(0),
    filesChanged: integer("files_changed").default(0),
    commits: integer("commits").default(1),

    // Stack info
    isStacked: integer("is_stacked", { mode: "boolean" }).default(false),
    stackPosition: integer("stack_position"),

    // Timestamps
    prCreatedAt: text("pr_created_at"),
    firstReviewAt: text("first_review_at"),
    approvedAt: text("approved_at"),
    mergedAt: text("merged_at"),

    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Weekly user review metrics (aggregated)
export const reviewMetrics = sqliteTable("review_metrics", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id").references(() => repositories.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id),

    // Time period
    weekOf: text("week_of").notNull(), // ISO week: "2024-W52"

    // Author metrics
    prsAuthored: integer("prs_authored").default(0),
    prsAuthoredMerged: integer("prs_authored_merged").default(0),
    avgTimeToMergeAuthored: integer("avg_time_to_merge_authored"),
    linesAuthoredAdded: integer("lines_authored_added").default(0),
    linesAuthoredRemoved: integer("lines_authored_removed").default(0),

    // Reviewer metrics
    prsReviewed: integer("prs_reviewed").default(0),
    avgTimeToReview: integer("avg_time_to_review"), // seconds
    commentsGiven: integer("comments_given").default(0),
    approvalsGiven: integer("approvals_given").default(0),
    changesRequestedGiven: integer("changes_requested_given").default(0),

    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Repository-level weekly metrics (aggregated)
export const repoMetrics = sqliteTable("repo_metrics", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),

    // Time period
    weekOf: text("week_of").notNull(), // ISO week

    // Volume
    prsOpened: integer("prs_opened").default(0),
    prsMerged: integer("prs_merged").default(0),
    prsClosed: integer("prs_closed").default(0),

    // Efficiency
    avgTimeToFirstReview: integer("avg_time_to_first_review"),
    avgTimeToMerge: integer("avg_time_to_merge"),
    avgReviewRounds: integer("avg_review_rounds"),

    // Size
    avgLinesChanged: integer("avg_lines_changed"),
    avgFilesChanged: integer("avg_files_changed"),

    // Stack adoption
    stackedPrs: integer("stacked_prs").default(0),
    stackedPrsPercentage: integer("stacked_prs_percentage").default(0),

    // Contributors
    activeAuthors: integer("active_authors").default(0),
    activeReviewers: integer("active_reviewers").default(0),

    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Relations
export const prMetricsRelations = relations(prMetrics, ({ one }) => ({
    pullRequest: one(pullRequests, {
        fields: [prMetrics.pullRequestId],
        references: [pullRequests.id],
    }),
    repository: one(repositories, {
        fields: [prMetrics.repositoryId],
        references: [repositories.id],
    }),
    author: one(users, {
        fields: [prMetrics.authorId],
        references: [users.id],
    }),
}));

export const reviewMetricsRelations = relations(reviewMetrics, ({ one }) => ({
    user: one(users, {
        fields: [reviewMetrics.userId],
        references: [users.id],
    }),
    repository: one(repositories, {
        fields: [reviewMetrics.repositoryId],
        references: [repositories.id],
    }),
}));

export const repoMetricsRelations = relations(repoMetrics, ({ one }) => ({
    repository: one(repositories, {
        fields: [repoMetrics.repositoryId],
        references: [repositories.id],
    }),
}));

// Types
export type PrMetric = typeof prMetrics.$inferSelect;
export type NewPrMetric = typeof prMetrics.$inferInsert;
export type ReviewMetric = typeof reviewMetrics.$inferSelect;
export type NewReviewMetric = typeof reviewMetrics.$inferInsert;
export type RepoMetric = typeof repoMetrics.$inferSelect;
export type NewRepoMetric = typeof repoMetrics.$inferInsert;
