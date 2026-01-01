/**
 * Branch Protection Schema - Drizzle ORM
 * Defines protection rules for repository branches
 */

import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const branchProtection = sqliteTable("branch_protection", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),

    // Rule definition
    pattern: text("pattern").notNull(), // Glob pattern like 'main', 'release/*', '*'
    active: integer("active", { mode: "boolean" }).default(true),

    // Constraints
    requiresPr: integer("requires_pr", { mode: "boolean" }).default(false),
    requiredApprovals: integer("required_approvals").default(1),
    dismissStaleReviews: integer("dismiss_stale_reviews", { mode: "boolean" }).default(false),
    requireCodeOwnerReviews: integer("require_code_owner_reviews", { mode: "boolean" }).default(false),

    allowForcePushes: integer("allow_force_pushes", { mode: "boolean" }).default(false),

    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
    createdById: text("created_by_id").references(() => users.id),
});

export const branchProtectionRelations = relations(branchProtection, ({ one }) => ({
    repository: one(repositories, {
        fields: [branchProtection.repositoryId],
        references: [repositories.id],
    }),
    createdBy: one(users, {
        fields: [branchProtection.createdById],
        references: [users.id],
    }),
}));

export type BranchProtectionRule = typeof branchProtection.$inferSelect;
export type NewBranchProtectionRule = typeof branchProtection.$inferInsert;
