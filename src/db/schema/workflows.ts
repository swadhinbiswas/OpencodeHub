/**
 * CI/CD Pipeline Schema - Drizzle ORM
 * Defines workflows, runs, jobs, steps, and artifacts
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { pullRequests } from "./pull-requests";
import { repositories } from "./repositories";
import { users } from "./users";

export const workflows = pgTable("workflows", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  path: text("path").notNull(), // .github/workflows/ci.yml
  state: text("state").notNull().default("active"), // active, disabled, deleted
  badgeUrl: text("badge_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workflowRuns = pgTable("workflow_runs", {
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
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),

  // Config from YAML
  workflowConfig: text("workflow_config"), // JSON - parsed workflow YAML

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workflowJobs = pgTable("workflow_jobs", {
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
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workflowSteps = pgTable("workflow_steps", {
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
  continueOnError: boolean("continue_on_error").default(
    false
  ),
  timeoutMinutes: integer("timeout_minutes"),

  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workflowLogs = pgTable("workflow_logs", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => workflowJobs.id, { onDelete: "cascade" }),
  stepId: text("step_id").references(() => workflowSteps.id),
  logLevel: text("log_level").notNull().default("info"), // debug, info, warn, error
  message: text("message").notNull(),
  timestamp: text("timestamp").notNull(),
  lineNumber: integer("line_number"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workflowArtifacts = pgTable("workflow_artifacts", {
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
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workflowSecrets = pgTable("workflow_secrets", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  environment: text("environment"), // null for repo-level, or environment name
  createdById: text("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workflowVariables = pgTable("workflow_variables", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  value: text("value").notNull(),
  environment: text("environment"),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const scheduledWorkflows = pgTable("scheduled_workflows", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  cronExpression: text("cron_expression").notNull(),
  timezone: text("timezone").default("UTC"),
  isEnabled: boolean("is_enabled").default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
