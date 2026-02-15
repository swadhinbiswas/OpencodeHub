import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { pullRequests } from "./pull-requests";
import { repositories } from "./repositories";
import { users } from "./users";

export const mergeQueue = pgTable("merge_queue", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    stackId: text("stack_id"), // Reference to stacked PR group

    // Queue management
    status: text("status").notNull().default("pending"), // pending, merging, merged, failed
    priority: integer("priority").default(0), // Higher = more important
    position: integer("position").default(0), // Queue position

    // CI status
    ciStatus: text("ci_status").default("pending"), // pending, running, passed, failed

    // Merge configuration
    mergeMethod: text("merge_method").default("merge"), // merge, squash, rebase
    deleteOnMerge: boolean("delete_on_merge").default(true),

    // Execution details
    executionBranch: text("execution_branch"), // mq/pr-123-attempt-1
    attemptCount: integer("attempt_count").default(0),
    lastAttemptAt: timestamp("last_attempt_at"),

    // Tracking
    addedById: text("added_by_id").references(() => users.id),
    addedAt: timestamp("added_at").notNull().defaultNow(),
    queuedAt: timestamp("queued_at").notNull().defaultNow(), // Alias for addedAt in some contexts
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    failureReason: text("failure_reason"),
});

// Alias for backwards compatibility
export const mergeQueueItems = mergeQueue;

export const mergeQueueRelations = relations(mergeQueue, ({ one, many }) => ({
    repository: one(repositories, {
        fields: [mergeQueue.repositoryId],
        references: [repositories.id],
    }),
    pullRequest: one(pullRequests, {
        fields: [mergeQueue.pullRequestId],
        references: [pullRequests.id],
    }),
    addedBy: one(users, {
        fields: [mergeQueue.addedById],
        references: [users.id],
    }),
    speculativeRuns: many(mergeQueueSpeculativeRuns),
}));

// Track speculative builds for batched merge queue processing
export const mergeQueueSpeculativeRuns = pgTable("merge_queue_speculative_runs", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),

    // The PRs included in this speculative run (comma-separated IDs)
    pullRequestIds: text("pull_request_ids").notNull(),

    // Branch created for this speculative build
    branchName: text("branch_name").notNull(),
    baseBranch: text("base_branch").notNull(),

    // Status tracking
    status: text("status").notNull().default("pending"), // pending, running, passed, failed, cancelled
    ciUrl: text("ci_url"), // Link to CI run

    // Timing
    createdAt: timestamp("created_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),

    // Results
    failureReason: text("failure_reason"),
    commitSha: text("commit_sha"), // SHA of the merged speculative commit
});

export const mergeQueueSpeculativeRunsRelations = relations(mergeQueueSpeculativeRuns, ({ one }) => ({
    repository: one(repositories, {
        fields: [mergeQueueSpeculativeRuns.repositoryId],
        references: [repositories.id],
    }),
}));

// Alias for backwards compatibility
export const mergeQueueItemsRelations = mergeQueueRelations;

export type MergeQueueEntry = typeof mergeQueue.$inferSelect;
export type NewMergeQueueEntry = typeof mergeQueue.$inferInsert;
export type SpeculativeRun = typeof mergeQueueSpeculativeRuns.$inferSelect;
export type NewSpeculativeRun = typeof mergeQueueSpeculativeRuns.$inferInsert;

// Backwards compatibility aliases
export type MergeQueueItem = MergeQueueEntry;
export type NewMergeQueueItem = NewMergeQueueEntry;

