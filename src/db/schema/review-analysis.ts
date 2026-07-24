/**
 * Review Analysis Schema - Drizzle ORM
 * Stores analysis results, summaries, and review data for PRs.
 */

import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { pullRequests } from "./pull-requests";
import { repositories } from "./repositories";
import { users } from "./users";

/**
 * Stores the full analysis result for a PR review.
 */
export const prReviewAnalyses = pgTable(
  "pr_review_analyses",
  {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending, running, completed, failed

    // Analysis results (JSON)
    complexityData: jsonb("complexity_data"),
    dependencyGraph: jsonb("dependency_graph"),
    architectureImpact: jsonb("architecture_impact"),
    changeGroups: jsonb("change_groups"),
    blastRadius: jsonb("blast_radius"),
    healthScore: integer("health_score"), // 0-100
    healthGrade: text("health_grade"), // A+, A, B, C, D, F

    // Summaries (JSON)
    summaries: jsonb("summaries"),

    // Metadata
    baseSha: text("base_sha"),
    headSha: text("head_sha"),
    filesAnalyzed: integer("files_analyzed"),
    chunksProcessed: integer("chunks_processed"),
    totalAdditions: integer("total_additions"),
    totalDeletions: integer("total_deletions"),

    // AI review metadata
    model: text("model"),
    provider: text("provider"),
    tokensUsed: integer("tokens_used"),
    costCents: integer("cost_cents"),
    rawAiResponse: jsonb("raw_ai_response"),

    // Tracking
    triggeredById: text("triggered_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    errorMessage: text("error_message"),
  },
  (t) => ({
    pullRequestIdx: index("pr_analysis_pr_idx").on(t.pullRequestId),
    repositoryIdx: index("pr_analysis_repo_idx").on(t.repositoryId),
    statusIdx: index("pr_analysis_status_idx").on(t.status),
    createdIdx: index("pr_analysis_created_idx").on(t.createdAt),
  }),
);

/**
 * Stores file-level summaries.
 */
export const fileSummaries = pgTable(
  "file_summaries",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => prReviewAnalyses.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    language: text("language"),
    summary: text("summary"),
    riskLevel: text("risk_level"), // low, medium, high, critical
    additions: integer("additions"),
    deletions: integer("deletions"),
    complexityScore: integer("complexity_score"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    analysisIdx: index("file_summaries_analysis_idx").on(t.analysisId),
    filePathIdx: index("file_summaries_path_idx").on(t.filePath),
  }),
);

/**
 * Stores inline AI review comments on specific lines.
 */
export const aiInlineComments = pgTable(
  "ai_inline_comments",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => prReviewAnalyses.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    line: integer("line").notNull(),
    endLine: integer("end_line"),
    side: text("side").default("right"), // left, right
    severity: text("severity").notNull(), // info, warning, error, critical
    type: text("type").notNull(), // bug, security, performance, style, documentation, suggestion
    category: text("category"), // code-quality, security, performance, architecture, testing
    title: text("title").notNull(),
    message: text("message").notNull(),
    suggestedFix: text("suggested_fix"),
    explanation: text("explanation"),
    confidence: integer("confidence"), // 0-100
    isResolved: integer("is_resolved").default(0), // 0 or 1
    isApplied: integer("is_applied").default(0),
    appliedAt: timestamp("applied_at"),
    dismissedAt: timestamp("dismissed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    analysisIdx: index("ai_inline_comments_analysis_idx").on(t.analysisId),
    pullRequestIdx: index("ai_inline_comments_pr_idx").on(t.pullRequestId),
    filePathIdx: index("ai_inline_comments_path_idx").on(t.filePath),
    severityIdx: index("ai_inline_comments_severity_idx").on(t.severity),
  }),
);

/**
 * Tracks AI review conversation threads (chat with AI about PR).
 */
export const aiReviewThreads = pgTable(
  "ai_review_threads",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => prReviewAnalyses.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    filePath: text("file_path"),
    line: integer("line"),
    messages: jsonb("messages").notNull(), // Array of { role, content, timestamp }
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    analysisIdx: index("ai_thread_analysis_idx").on(t.analysisId),
    pullRequestIdx: index("ai_thread_pr_idx").on(t.pullRequestId),
  }),
);
