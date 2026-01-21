import { relations } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { pullRequests } from "./pull-requests";
import { repositories } from "./repositories";

export const mergeQueueItems = pgTable("merge_queue_items", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),

    // Status tracking
    status: text("status").notNull().default("queued"), // queued, running, failed, merged

    // Execution details
    attemptCount: integer("attempt_count").default(0),
    lastAttemptAt: timestamp("last_attempt_at"),
    executionBranch: text("execution_branch"), // mq/pr-123-attempt-1
    position: integer("position").default(0),

    // Timestamps
    queuedAt: timestamp("queued_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
});

export const mergeQueueItemsRelations = relations(mergeQueueItems, ({ one }) => ({
    repository: one(repositories, {
        fields: [mergeQueueItems.repositoryId],
        references: [repositories.id],
    }),
    pullRequest: one(pullRequests, {
        fields: [mergeQueueItems.pullRequestId],
        references: [pullRequests.id],
    }),
}));

export type MergeQueueItem = typeof mergeQueueItems.$inferSelect;
export type NewMergeQueueItem = typeof mergeQueueItems.$inferInsert;
