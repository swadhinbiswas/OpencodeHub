/**
 * Automation Rules Schema - Drizzle ORM
 * Workflow automation with triggers, conditions, and actions
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { users } from "./users";

/**
 * Automation rules for triggering actions based on events
 * Similar to GitHub Actions but for PR workflow automation
 */
export const automationRules = pgTable("automation_rules", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .references(() => repositories.id, { onDelete: "cascade" }),
    organizationId: text("organization_id"), // Optional org-wide rules
    createdById: text("created_by_id")
        .notNull()
        .references(() => users.id),
    name: text("name").notNull(),
    description: text("description"),
    trigger: text("trigger").notNull(), // Event that triggers this rule
    conditions: text("conditions"), // JSON - conditions to evaluate
    actions: text("actions").notNull(), // JSON - actions to execute
    isEnabled: boolean("is_enabled").default(true),
    priority: integer("priority").default(0), // Higher = runs first
    runCount: integer("run_count").default(0),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Trigger types:
 * - pr_opened: Pull request is opened
 * - pr_updated: Pull request is updated (new commits)
 * - pr_review_requested: Review is requested
 * - pr_approved: Pull request is approved
 * - pr_changes_requested: Changes are requested
 * - pr_merged: Pull request is merged
 * - pr_closed: Pull request is closed
 * - ci_passed: All CI checks pass
 * - ci_failed: Any CI check fails
 * - label_added: Label is added to PR
 * - label_removed: Label is removed from PR
 * - comment_added: Comment is added
 * - stack_created: New stack is created
 * - stack_updated: Stack is updated
 */

/**
 * Action types:
 * - add_label: Add a label to the PR
 * - remove_label: Remove a label from the PR
 * - assign_reviewer: Assign a reviewer
 * - assign_user: Assign a user
 * - add_to_merge_queue: Add to merge queue
 * - remove_from_merge_queue: Remove from merge queue
 * - add_comment: Add a comment
 * - trigger_ai_review: Trigger AI code review
 * - notify_slack: Send Slack notification
 * - close_pr: Close the pull request
 * - request_changes: Request changes programmatically
 */

/**
 * Log of automation rule executions
 */
export const automationExecutions = pgTable("automation_executions", {
    id: text("id").primaryKey(),
    ruleId: text("rule_id")
        .notNull()
        .references(() => automationRules.id, { onDelete: "cascade" }),
    triggeredById: text("triggered_by_id"), // Event source (PR, Issue, etc.)
    triggeredByType: text("triggered_by_type"), // pull_request, issue, etc.
    triggerEvent: text("trigger_event").notNull(),
    conditionsMatched: boolean("conditions_matched"),
    actionsExecuted: text("actions_executed"), // JSON array of actions run
    status: text("status").notNull().default("pending"), // pending, success, failed, skipped
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const automationRulesRelations = relations(automationRules, ({ one, many }) => ({
    repository: one(repositories, {
        fields: [automationRules.repositoryId],
        references: [repositories.id],
    }),
    createdBy: one(users, {
        fields: [automationRules.createdById],
        references: [users.id],
    }),
    executions: many(automationExecutions),
}));

export const automationExecutionsRelations = relations(automationExecutions, ({ one }) => ({
    rule: one(automationRules, {
        fields: [automationExecutions.ruleId],
        references: [automationRules.id],
    }),
}));

// Types
export type AutomationRule = typeof automationRules.$inferSelect;
export type AutomationExecution = typeof automationExecutions.$inferSelect;

export type AutomationTrigger =
    | "pr_opened"
    | "pr_updated"
    | "pr_review_requested"
    | "pr_approved"
    | "pr_changes_requested"
    | "pr_merged"
    | "pr_closed"
    | "ci_passed"
    | "ci_failed"
    | "label_added"
    | "label_removed"
    | "comment_added"
    | "stack_created"
    | "stack_updated";

export type AutomationActionType =
    | "add_label"
    | "remove_label"
    | "assign_reviewer"
    | "assign_user"
    | "add_to_merge_queue"
    | "remove_from_merge_queue"
    | "add_comment"
    | "trigger_ai_review"
    | "notify_slack"
    | "notify_discord"
    | "notify_teams"
    | "close_pr"
    | "request_changes";

export interface AutomationCondition {
    field: string; // e.g., "pr.author", "pr.labels", "pr.changedFiles"
    operator: "equals" | "not_equals" | "contains" | "not_contains" | "matches" | "greater_than" | "less_than";
    value: string | number | boolean | string[];
}

export interface AutomationAction {
    type: AutomationActionType;
    params: Record<string, unknown>;
}
