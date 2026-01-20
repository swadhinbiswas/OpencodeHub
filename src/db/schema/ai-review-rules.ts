/**
 * AI Review Rules Schema - Drizzle ORM
 * Custom AI review rules with prompts and patterns
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { users } from "./users";

/**
 * Custom AI review rules for repository-specific reviews
 * Similar to Graphite Agent's custom rules feature
 */
export const aiReviewRules = pgTable("ai_review_rules", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .references(() => repositories.id, { onDelete: "cascade" }),
    organizationId: text("organization_id"), // Optional org-wide rules
    createdById: text("created_by_id")
        .notNull()
        .references(() => users.id),
    name: text("name").notNull(),
    description: text("description"),

    // Rule definition
    ruleType: text("rule_type").notNull().default("ai_prompt"), // ai_prompt, regex, both
    aiPrompt: text("ai_prompt"), // Custom AI prompt for this rule
    regexPattern: text("regex_pattern"), // Regex pattern to match

    // Severity and categorization
    severity: text("severity").notNull().default("info"), // info, warning, error, critical
    category: text("category"), // security, performance, style, bug, documentation

    // Scope
    fileGlobs: text("file_globs"), // JSON array of glob patterns to include
    excludeGlobs: text("exclude_globs"), // JSON array of glob patterns to exclude
    languages: text("languages"), // JSON array of languages to apply to

    // Behavior
    isEnabled: boolean("is_enabled").default(true),
    isAutoFix: boolean("is_auto_fix").default(false), // Can auto-fix
    priority: integer("priority").default(0), // Higher = runs first

    // Stats
    matchCount: integer("match_count").default(0),
    lastMatchAt: timestamp("last_match_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Pre-built rule templates that users can import
 */
export const aiReviewRuleTemplates = pgTable("ai_review_rule_templates", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    ruleType: text("rule_type").notNull(),
    aiPrompt: text("ai_prompt"),
    regexPattern: text("regex_pattern"),
    severity: text("severity").notNull(),
    category: text("category"),
    fileGlobs: text("file_globs"),
    languages: text("languages"),
    isBuiltIn: boolean("is_built_in").default(false),
    usageCount: integer("usage_count").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Codebase context for AI reviews - stores patterns and conventions
 */
export const aiCodebaseContext = pgTable("ai_codebase_context", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    contextType: text("context_type").notNull(), // naming_convention, pattern, architecture, etc.
    name: text("name").notNull(),
    description: text("description"),
    examples: text("examples"), // JSON array of code examples
    antiPatterns: text("anti_patterns"), // JSON array of things to avoid
    isAutoDetected: boolean("is_auto_detected").default(false),
    confidence: integer("confidence"), // 0-100 if auto-detected
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Relations
export const aiReviewRulesRelations = relations(aiReviewRules, ({ one }) => ({
    repository: one(repositories, {
        fields: [aiReviewRules.repositoryId],
        references: [repositories.id],
    }),
    createdBy: one(users, {
        fields: [aiReviewRules.createdById],
        references: [users.id],
    }),
}));

export const aiCodebaseContextRelations = relations(aiCodebaseContext, ({ one }) => ({
    repository: one(repositories, {
        fields: [aiCodebaseContext.repositoryId],
        references: [repositories.id],
    }),
}));

// Types
export type AIReviewRule = typeof aiReviewRules.$inferSelect;
export type AIReviewRuleTemplate = typeof aiReviewRuleTemplates.$inferSelect;
export type AICodebaseContext = typeof aiCodebaseContext.$inferSelect;

export interface AIReviewRuleConfig {
    name: string;
    description?: string;
    ruleType: "ai_prompt" | "regex" | "both";
    aiPrompt?: string;
    regexPattern?: string;
    severity: "info" | "warning" | "error" | "critical";
    category?: "security" | "performance" | "style" | "bug" | "documentation";
    fileGlobs?: string[];
    excludeGlobs?: string[];
    languages?: string[];
}
