/**
 * AI Code Reviews Schema
 * LLM-powered code review with inline suggestions
 */

import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pullRequests } from "./pull-requests";
import { users } from "./users";

// AI Reviews - one per PR run
export const aiReviews = sqliteTable("ai_reviews", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),

    // Status
    status: text("status").notNull().default("pending"), // pending, running, completed, failed

    // Model info
    model: text("model").notNull(), // gpt-4, claude-3-opus, etc.
    provider: text("provider").notNull(), // openai, anthropic, local

    // Stack context
    stackContext: text("stack_context"), // JSON: context from parent PRs
    includesStackContext: integer("includes_stack_context", { mode: "boolean" }).default(false),

    // Results
    summary: text("summary"), // Overall review summary
    overallSeverity: text("overall_severity"), // info, warning, error, critical
    suggestionsCount: integer("suggestions_count").default(0),

    // Usage tracking
    tokensUsed: integer("tokens_used"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    costCents: integer("cost_cents"), // Cost in cents

    // Raw data
    rawResponse: text("raw_response"), // Full JSON response

    // Timing
    triggeredById: text("triggered_by_id").references(() => users.id),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),

    // Error
    errorMessage: text("error_message"),
});

// AI Review Suggestions - individual findings
export const aiReviewSuggestions = sqliteTable("ai_review_suggestions", {
    id: text("id").primaryKey(),
    aiReviewId: text("ai_review_id")
        .notNull()
        .references(() => aiReviews.id, { onDelete: "cascade" }),

    // Location
    path: text("path").notNull(),
    line: integer("line"),
    endLine: integer("end_line"),

    // Classification
    severity: text("severity").notNull(), // info, warning, error, critical
    type: text("type").notNull(), // bug, security, performance, style, documentation, suggestion
    category: text("category"), // Optional sub-category

    // Content
    title: text("title").notNull(),
    message: text("message").notNull(),
    suggestedFix: text("suggested_fix"), // Code suggestion
    explanation: text("explanation"), // Why this matters

    // Actions
    isApplied: integer("is_applied", { mode: "boolean" }).default(false),
    isDismissed: integer("is_dismissed", { mode: "boolean" }).default(false),
    appliedAt: text("applied_at"),
    appliedById: text("applied_by_id").references(() => users.id),
    dismissedAt: text("dismissed_at"),
    dismissedById: text("dismissed_by_id").references(() => users.id),
    dismissReason: text("dismiss_reason"),

    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Relations
export const aiReviewsRelations = relations(aiReviews, ({ one, many }) => ({
    pullRequest: one(pullRequests, {
        fields: [aiReviews.pullRequestId],
        references: [pullRequests.id],
    }),
    triggeredBy: one(users, {
        fields: [aiReviews.triggeredById],
        references: [users.id],
    }),
    suggestions: many(aiReviewSuggestions),
}));

export const aiReviewSuggestionsRelations = relations(aiReviewSuggestions, ({ one }) => ({
    aiReview: one(aiReviews, {
        fields: [aiReviewSuggestions.aiReviewId],
        references: [aiReviews.id],
    }),
    appliedBy: one(users, {
        fields: [aiReviewSuggestions.appliedById],
        references: [users.id],
    }),
}));

// Types
export type AiReview = typeof aiReviews.$inferSelect;
export type NewAiReview = typeof aiReviews.$inferInsert;
export type AiReviewSuggestion = typeof aiReviewSuggestions.$inferSelect;
export type NewAiReviewSuggestion = typeof aiReviewSuggestions.$inferInsert;
