/**
 * Custom PR States Schema
 * Allows repositories to define custom workflow states for PRs
 */

import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { repositories } from "./repositories";
import { users } from "./users";
import { teams } from "./teams";

/**
 * PR State Definitions
 * Custom states that can be assigned to PRs in a repository
 */
export const prStateDefinitions = pgTable("pr_state_definitions", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),

    // State info
    name: text("name").notNull(), // e.g., "needs_work", "ready_to_merge", "on_hold"
    displayName: text("display_name").notNull(), // e.g., "Needs Work", "Ready to Merge"
    description: text("description"),
    color: text("color").notNull().default("#6B7280"), // Hex color for UI
    icon: text("icon"), // Icon name for UI

    // Ordering and behavior
    order: integer("order").notNull().default(0),
    isDefault: boolean("is_default").default(false), // Default state for new PRs
    isFinal: boolean("is_final").default(false), // States like "merged" or "closed"
    allowMerge: boolean("allow_merge").default(false), // Can merge from this state

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Required Reviewers Per State
 * Defines who must approve before transitioning to a state
 */
export const prStateReviewers = pgTable("pr_state_reviewers", {
    id: text("id").primaryKey(),
    stateDefinitionId: text("state_definition_id")
        .notNull()
        .references(() => prStateDefinitions.id, { onDelete: "cascade" }),

    // Reviewer target - one of these
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),

    // How many approvals needed (for team)
    requiredCount: integer("required_count").default(1),

    createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * PR State Transitions
 * Track state change history
 */
export const prStateTransitions = pgTable("pr_state_transitions", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id").notNull(),

    fromState: text("from_state"),
    toState: text("to_state").notNull(),

    changedById: text("changed_by_id")
        .notNull()
        .references(() => users.id),

    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const prStateDefinitionsRelations = relations(prStateDefinitions, ({ one, many }) => ({
    repository: one(repositories, {
        fields: [prStateDefinitions.repositoryId],
        references: [repositories.id],
    }),
    reviewers: many(prStateReviewers),
}));

export const prStateReviewersRelations = relations(prStateReviewers, ({ one }) => ({
    stateDefinition: one(prStateDefinitions, {
        fields: [prStateReviewers.stateDefinitionId],
        references: [prStateDefinitions.id],
    }),
    user: one(users, {
        fields: [prStateReviewers.userId],
        references: [users.id],
    }),
    team: one(teams, {
        fields: [prStateReviewers.teamId],
        references: [teams.id],
    }),
}));

// Types
export type PRStateDefinition = typeof prStateDefinitions.$inferSelect;
export type NewPRStateDefinition = typeof prStateDefinitions.$inferInsert;
export type PRStateReviewer = typeof prStateReviewers.$inferSelect;
export type PRStateTransition = typeof prStateTransitions.$inferSelect;
