/**
 * Stacked Pull Requests Schema
 * Enables first-class stacked PR workflows
 */

import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pullRequests } from "./pull-requests";
import { repositories } from "./repositories";
import { users } from "./users";

// PR Stacks - groups of related stacked PRs
export const prStacks = sqliteTable("pr_stacks", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name"), // Optional stack name
    baseBranch: text("base_branch").notNull(),
    status: text("status").notNull().default("active"), // active, merged, closed
    createdById: text("created_by_id")
        .notNull()
        .references(() => users.id),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Stack entries - individual PRs in a stack with ordering
export const prStackEntries = sqliteTable("pr_stack_entries", {
    id: text("id").primaryKey(),
    stackId: text("stack_id")
        .notNull()
        .references(() => prStacks.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    stackOrder: integer("stack_order").notNull(), // Position in stack (1 = base)
    parentPrId: text("parent_pr_id").references(() => pullRequests.id),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Relations
export const prStacksRelations = relations(prStacks, ({ one, many }) => ({
    repository: one(repositories, {
        fields: [prStacks.repositoryId],
        references: [repositories.id],
    }),
    createdBy: one(users, {
        fields: [prStacks.createdById],
        references: [users.id],
    }),
    entries: many(prStackEntries),
}));

export const prStackEntriesRelations = relations(prStackEntries, ({ one }) => ({
    stack: one(prStacks, {
        fields: [prStackEntries.stackId],
        references: [prStacks.id],
    }),
    pullRequest: one(pullRequests, {
        fields: [prStackEntries.pullRequestId],
        references: [pullRequests.id],
    }),
    parentPr: one(pullRequests, {
        fields: [prStackEntries.parentPrId],
        references: [pullRequests.id],
    }),
}));

// Types
export type PrStack = typeof prStacks.$inferSelect;
export type NewPrStack = typeof prStacks.$inferInsert;
export type PrStackEntry = typeof prStackEntries.$inferSelect;
export type NewPrStackEntry = typeof prStackEntries.$inferInsert;
