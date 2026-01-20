/**
 * Branch Protection Schema - Drizzle ORM
 * Defines protection rules for repository branches
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const branchProtection = pgTable("branch_protection", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),

    // Rule definition
    pattern: text("pattern").notNull(), // Glob pattern like 'main', 'release/*', '*'
    active: boolean("active").default(true),

    // Constraints
    requiresPr: boolean("requires_pr").default(false),
    requiredApprovals: integer("required_approvals").default(1),
    dismissStaleReviews: boolean("dismiss_stale_reviews").default(false),
    requireCodeOwnerReviews: boolean("require_code_owner_reviews").default(false),

    allowForcePushes: boolean("allow_force_pushes").default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
