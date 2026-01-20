/**
 * Merge Queue Schema
 * Stack-aware merge queue with CI optimization
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { pullRequests } from "./pull-requests";
import { repositories } from "./repositories";
import { users } from "./users";
import { prStacks } from "./stacked-prs";

// Merge queue entries
export const mergeQueue = pgTable("merge_queue", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    stackId: text("stack_id").references(() => prStacks.id), // Stack-aware

    // Queue status
    status: text("status").notNull().default("pending"), // pending, testing, ready, merging, merged, failed
    priority: integer("priority").notNull().default(0), // Higher = merge first
    position: integer("position"), // Current position in queue

    // CI integration
    ciStatus: text("ci_status").default("pending"), // pending, running, passed, failed
    ciRunId: text("ci_run_id"),

    // Timing
    addedById: text("added_by_id")
        .notNull()
        .references(() => users.id),
    addedAt: timestamp("added_at").notNull().defaultNow(),
    estimatedMergeAt: timestamp("estimated_merge_at"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),

    // Error handling
    failureReason: text("failure_reason"),
    retryCount: integer("retry_count").default(0),

    // Merge options
    mergeMethod: text("merge_method").default("merge"), // merge, squash, rebase
    deleteOnMerge: boolean("delete_on_merge").default(true),
});

// Relations
export const mergeQueueRelations = relations(mergeQueue, ({ one }) => ({
    repository: one(repositories, {
        fields: [mergeQueue.repositoryId],
        references: [repositories.id],
    }),
    pullRequest: one(pullRequests, {
        fields: [mergeQueue.pullRequestId],
        references: [pullRequests.id],
    }),
    stack: one(prStacks, {
        fields: [mergeQueue.stackId],
        references: [prStacks.id],
    }),
    addedBy: one(users, {
        fields: [mergeQueue.addedById],
        references: [users.id],
    }),
}));

// Types
export type MergeQueueEntry = typeof mergeQueue.$inferSelect;
export type NewMergeQueueEntry = typeof mergeQueue.$inferInsert;
