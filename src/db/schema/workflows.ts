/**
 * CI/CD Pipeline Schema - Drizzle ORM
 * Defines workflows, runs, jobs, steps, and artifacts
 */

import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pullRequests } from "./pull-requests";
import { repositories } from "./repositories";
import { users } from "./users";

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  path: text("path").notNull(), // .github/workflows/ci.yml
  state: text("state").notNull().default("active"), // active, disabled, deleted
  badgeUrl: text("badge_url"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const workflowRuns = sqliteTable("workflow_runs", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  runNumber: integer("run_number").notNull(),
  runAttempt: integer("run_attempt").notNull().default(1),
  name: text("name").notNull(),
  displayTitle: text("display_title"),
  status: text("status").notNull().default("queued"), // queued, in_progress, completed
  conclusion: text("conclusion"), // success, failure, cancelled, skipped, neutral, timed_out, action_required
  event: text("event").notNull(), // push, pull_request, schedule, workflow_dispatch, etc.

  // Git context
  headBranch: text("head_branch"),
  headSha: text("head_sha").notNull(),
  baseBranch: text("base_branch"),
  baseSha: text("base_sha"),

  // References
  pullRequestId: text("pull_request_id").references(() => pullRequests.id),
  triggeredById: text("triggered_by_id").references(() => users.id),

  // Timing
  startedAt: text("started_at"),
  completedAt: text("completed_at"),

  // Config from YAML
  workflowConfig: text("workflow_config"), // JSON - parsed workflow YAML

  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const workflowJobs = sqliteTable("workflow_jobs", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("queued"), // queued, in_progress, completed
  conclusion: text("conclusion"), // success, failure, cancelled, skipped

  // Runner info
  runnerId: text("runner_id"),
  runnerName: text("runner_name"),
  runnerGroupId: text("runner_group_id"),
  runnerGroupName: text("runner_group_name"),

  // Container info
  containerId: text("container_id"),
  containerImage: text("container_image"),

  // Dependencies
  needs: text("needs"), // JSON array of job names this depends on

  // Environment
  environment: text("environment"),
  environmentUrl: text("environment_url"),

  // Matrix
  matrix: text("matrix"), // JSON - matrix configuration for this job instance

  // Timing
  startedAt: text("started_at"),
  completedAt: text("completed_at"),

  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const workflowSteps = sqliteTable("workflow_steps", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => workflowJobs.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("queued"), // queued, in_progress, completed
  conclusion: text("conclusion"), // success, failure, cancelled, skipped

  // Step configuration
  uses: text("uses"), // action reference: actions/checkout@v4
  run: text("run"), // shell command
  shell: text("shell"), // bash, pwsh, python, etc.
  workingDirectory: text("working_directory"),
  env: text("env"), // JSON
  with: text("with"), // JSON - action inputs

  // Conditionals
  if: text("if"),
  continueOnError: integer("continue_on_error", { mode: "boolean" }).default(
    false
  ),
  timeoutMinutes: integer("timeout_minutes"),

  // Timing
  startedAt: text("started_at"),
  completedAt: text("completed_at"),

  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const workflowLogs = sqliteTable("workflow_logs", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => workflowJobs.id, { onDelete: "cascade" }),
  stepId: text("step_id").references(() => workflowSteps.id),
  logLevel: text("log_level").notNull().default("info"), // debug, info, warn, error
  message: text("message").notNull(),
  timestamp: text("timestamp").notNull(),
  lineNumber: integer("line_number"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const workflowArtifacts = sqliteTable("workflow_artifacts", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  jobId: text("job_id").references(() => workflowJobs.id),
  name: text("name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type"),
  downloadCount: integer("download_count").default(0),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const workflowSecrets = sqliteTable("workflow_secrets", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  environment: text("environment"), // null for repo-level, or environment name
  createdById: text("created_by_id").references(() => users.id),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const workflowVariables = sqliteTable("workflow_variables", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  value: text("value").notNull(),
  environment: text("environment"),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const scheduledWorkflows = sqliteTable("scheduled_workflows", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  cronExpression: text("cron_expression").notNull(),
  timezone: text("timezone").default("UTC"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Relations
export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [workflows.repositoryId],
    references: [repositories.id],
  }),
  runs: many(workflowRuns),
  schedules: many(scheduledWorkflows),
}));

export const workflowRunsRelations = relations(
  workflowRuns,
  ({ one, many }) => ({
    workflow: one(workflows, {
      fields: [workflowRuns.workflowId],
      references: [workflows.id],
    }),
    repository: one(repositories, {
      fields: [workflowRuns.repositoryId],
      references: [repositories.id],
    }),
    pullRequest: one(pullRequests, {
      fields: [workflowRuns.pullRequestId],
      references: [pullRequests.id],
    }),
    triggeredBy: one(users, {
      fields: [workflowRuns.triggeredById],
      references: [users.id],
    }),
    jobs: many(workflowJobs),
    artifacts: many(workflowArtifacts),
  })
);

export const workflowJobsRelations = relations(
  workflowJobs,
  ({ one, many }) => ({
    run: one(workflowRuns, {
      fields: [workflowJobs.runId],
      references: [workflowRuns.id],
    }),
    steps: many(workflowSteps),
    logs: many(workflowLogs),
    artifacts: many(workflowArtifacts),
  })
);

export const workflowStepsRelations = relations(
  workflowSteps,
  ({ one, many }) => ({
    job: one(workflowJobs, {
      fields: [workflowSteps.jobId],
      references: [workflowJobs.id],
    }),
    logs: many(workflowLogs),
  })
);

// Types
export type Workflow = typeof workflows.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type WorkflowJob = typeof workflowJobs.$inferSelect;
export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type WorkflowLog = typeof workflowLogs.$inferSelect;
export type WorkflowArtifact = typeof workflowArtifacts.$inferSelect;
export type WorkflowSecret = typeof workflowSecrets.$inferSelect;
