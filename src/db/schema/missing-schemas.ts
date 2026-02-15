/**
 * Missing Schema Definitions
 * These schemas are referenced by code but were not previously defined.
 * Created to resolve TypeScript compilation errors.
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { users } from "./users";
import { repositories } from "./repositories";
import { pullRequests } from "./pull-requests";
import { issues } from "./issues";
import { organizations } from "./organizations";

// ============== CI/CD Integration ==============

export const requiredStatusChecks = pgTable("required_status_checks", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    branch: text("branch").notNull(), // Branch pattern, e.g., "main", "release/*"
    checkName: text("check_name").notNull(),
    isRequired: boolean("is_required").default(true),
    strictMode: boolean("strict_mode").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mergeGates = pgTable("merge_gates", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    gateType: text("gate_type").notNull(), // status_check, review, label, custom
    config: text("config"), // JSON config
    conditionScript: text("condition_script"),
    isEnabled: boolean("is_enabled").default(true),
    order: integer("order").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const externalCIConfigs = pgTable("external_ci_configs", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // jenkins, circleci, travis, gitlab_ci, azure_devops
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    apiToken: text("api_token"), // Encrypted
    projectId: text("project_id"), // Provider-specific project identifier
    webhookSecret: text("webhook_secret"),
    isEnabled: boolean("is_enabled").default(true),
    syncStatus: boolean("sync_status").default(true), // Sync status back to PR
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const externalBuilds = pgTable("external_builds", {
    id: text("id").primaryKey(),
    configId: text("config_id")
        .notNull()
        .references(() => externalCIConfigs.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id"),
    externalBuildId: text("external_build_id").notNull(),
    buildNumber: text("build_number"),
    status: text("status").notNull(), // pending, running, success, failure, cancelled
    url: text("url"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============== Notifications and Integrations ==============

export const chatIntegrations = pgTable("chat_integrations", {
    id: text("id").primaryKey(),
    organizationId: text("organization_id"),
    repositoryId: text("repository_id"),
    provider: text("provider").notNull(), // slack, teams, discord, email
    name: text("name").notNull(),
    webhookUrl: text("webhook_url"),
    apiToken: text("api_token"),
    channelId: text("channel_id"),
    isEnabled: boolean("is_enabled").default(true),
    events: jsonb("events").$type<string[]>().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const emailSettings = pgTable("email_settings", {
    id: text("id").primaryKey(),
    organizationId: text("organization_id"),
    smtpHost: text("smtp_host"),
    smtpPort: text("smtp_port"),
    smtpUser: text("smtp_user"),
    smtpPass: text("smtp_pass"),
    fromAddress: text("from_address"),
    fromName: text("from_name"),
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============== Issue Tracking Integration ==============

export const issueTrackerConfigs = pgTable("issue_tracker_configs", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // jira, linear, trello, clickup
    name: text("name").notNull(),
    apiUrl: text("api_url"),
    apiToken: text("api_token"),
    projectKey: text("project_key"),
    webhookSecret: text("webhook_secret"),
    isEnabled: boolean("is_enabled").default(true),
    syncToExternal: boolean("sync_to_external").default(true),
    syncFromExternal: boolean("sync_from_external").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const issueTrackerLinks = pgTable("issue_tracker_links", {
    id: text("id").primaryKey(),
    configId: text("config_id")
        .notNull()
        .references(() => issueTrackerConfigs.id, { onDelete: "cascade" }),
    localIssueId: text("local_issue_id")
        .references(() => issues.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    externalKey: text("external_key"),
    externalUrl: text("external_url"),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const prIssueLinks = pgTable("pr_issue_links", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    issueId: text("issue_id")
        .notNull()
        .references(() => issues.id, { onDelete: "cascade" }),
    linkType: text("link_type").notNull(), // closes, fixes, relates, blocks, duplicates
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const crossRepoIssueLinks = pgTable("cross_repo_issue_links", {
    id: text("id").primaryKey(),
    sourceIssueId: text("source_issue_id")
        .notNull()
        .references(() => issues.id, { onDelete: "cascade" }),
    targetIssueId: text("target_issue_id")
        .notNull()
        .references(() => issues.id, { onDelete: "cascade" }),
    linkType: text("link_type").notNull(), // relates, blocks, blocked_by, duplicates
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============== Code Quality and Coverage ==============

export const codeQualityConfigs = pgTable("code_quality_configs", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // codecov, coveralls, sonarqube, snyk
    projectKey: text("project_key"),
    apiToken: text("api_token"),
    serverUrl: text("server_url"),
    webhookSecret: text("webhook_secret"),
    isEnabled: boolean("is_enabled").default(true),
    reportOnPR: boolean("report_on_pr").default(true),
    blockOnFail: boolean("block_on_fail").default(false),
    minCoverage: real("min_coverage"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const codeQualityIssues = pgTable("code_quality_issues", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id"),
    commitSha: text("commit_sha").notNull(),
    provider: text("provider").notNull(),
    issueType: text("issue_type").notNull(), // bug, vulnerability, code_smell, security_hotspot
    severity: text("severity").notNull(), // blocker, critical, major, minor, info
    message: text("message").notNull(),
    file: text("file"),
    line: integer("line"),
    rule: text("rule"),
    effort: text("effort"),
    status: text("status").default("open"), // open, resolved, false_positive
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const coverageReports = pgTable("coverage_reports", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id"),
    commitSha: text("commit_sha").notNull(),
    provider: text("provider").notNull(),
    coverage: real("coverage").notNull(), // Percentage 0-100
    linesCovered: integer("lines_covered"),
    linesTotal: integer("lines_total"),
    branchCoverage: real("branch_coverage"),
    delta: real("delta"),
    status: text("status").notNull(), // success, failure, pending
    reportUrl: text("report_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============== Security ==============

export const secretScanResults = pgTable("secret_scan_results", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    secretType: text("secret_type").notNull(), // aws_key, github_token, private_key, etc.
    file: text("file").notNull(),
    line: integer("line"),
    snippet: text("snippet"), // Masked snippet
    severity: text("severity").notNull(), // critical, high, medium, low
    status: text("status").default("open"), // open, resolved, false_positive
    resolvedAt: timestamp("resolved_at"),
    resolvedById: text("resolved_by_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const licenseScans = pgTable("license_scans", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    packageName: text("package_name").notNull(),
    packageVersion: text("package_version"),
    license: text("license").notNull(),
    licenseType: text("license_type").notNull(), // permissive, copyleft, proprietary, unknown
    isCompliant: boolean("is_compliant").notNull(),
    policyViolation: text("policy_violation"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ipAllowLists = pgTable("ip_allow_lists", {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    cidrBlock: text("cidr_block").notNull(), // e.g., "192.168.1.0/24"
    description: text("description"),
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    createdById: text("created_by_id").notNull(),
});

export const samlConfigs = pgTable("saml_configs", {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    entityId: text("entity_id").notNull(),
    ssoUrl: text("sso_url").notNull(),
    certificate: text("certificate").notNull(),
    signatureAlgorithm: text("signature_algorithm").default("RSA-SHA256"),
    digestAlgorithm: text("digest_algorithm").default("SHA256"),
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============== Rate Limiting ==============

export const rateLimitRules = pgTable("rate_limit_rules", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    path: text("path").notNull(), // API path pattern
    method: text("method"), // GET, POST, etc. or null for all
    windowMs: integer("window_ms").notNull(), // Time window in milliseconds
    maxRequests: integer("max_requests").notNull(),
    keyType: text("key_type").default("ip"), // ip, user, token
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rateLimitLogs = pgTable("rate_limit_logs", {
    id: text("id").primaryKey(),
    ruleId: text("rule_id")
        .notNull()
        .references(() => rateLimitRules.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // IP, user ID, or token
    requestCount: integer("request_count").notNull(),
    windowStart: timestamp("window_start").notNull(),
    blocked: boolean("blocked").default(false),
});

// ============== Analytics and Dashboards ==============

export const metricSnapshots = pgTable("metric_snapshots", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .references(() => repositories.id, { onDelete: "cascade" }),
    organizationId: text("organization_id"),
    metricType: text("metric_type").notNull(),
    value: real("value").notNull(),
    dimensions: jsonb("dimensions").$type<Record<string, string>>(),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const customDashboards = pgTable("custom_dashboards", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isPublic: boolean("is_public").default(false),
    layout: jsonb("layout").$type<{ columns: number; rows: number }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const dashboardWidgets = pgTable("dashboard_widgets", {
    id: text("id").primaryKey(),
    dashboardId: text("dashboard_id")
        .notNull()
        .references(() => customDashboards.id, { onDelete: "cascade" }),
    widgetType: text("widget_type").notNull(),
    title: text("title").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>(),
    position: jsonb("position").$type<{ x: number; y: number; w: number; h: number }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fileHotspots = pgTable("file_hotspots", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    changeCount: integer("change_count").default(0),
    bugCount: integer("bug_count").default(0),
    reviewCount: integer("review_count").default(0),
    complexityScore: real("complexity_score"),
    lastModified: timestamp("last_modified"),
    calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
});



// ============== Issue Workflows ==============

export const repositoryWorkflows = pgTable("repository_workflows", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    path: text("path").notNull(), // e.g., .github/workflows/ci.yml
    content: text("content").notNull(),
    templateId: text("template_id").references(() => workflowTemplates.id),
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workflowStates = pgTable("workflow_states", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(), // todo, in_progress, done
    color: text("color").default("#6b7280"),
    icon: text("icon"),
    displayOrder: integer("display_order").default(0),
    isDefault: boolean("is_default").default(false),
    isClosedState: boolean("is_closed_state").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workflowTransitions = pgTable("workflow_transitions", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    fromStateId: text("from_state_id").references(() => workflowStates.id, { onDelete: "cascade" }),
    toStateId: text("to_state_id")
        .notNull()
        .references(() => workflowStates.id, { onDelete: "cascade" }),
    requiresComment: boolean("requires_comment").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workflowTemplates = pgTable("workflow_templates", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(), // ci, cd, security, quality, custom
    language: text("language"), // node, python, go, rust, etc.
    content: text("content").notNull(), // YAML workflow content
    isOfficial: boolean("is_official").default(false),
    isPublic: boolean("is_public").default(true),
    createdById: text("created_by_id"),
    downloads: text("downloads").default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============== Review Templates ==============

export const reviewTemplates = pgTable("review_templates", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    organizationId: text("organization_id"),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    content: text("content").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fileApprovals = pgTable("file_approvals", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    path: text("path").notNull(), // File path
    approvedById: text("approved_by_id")
        .notNull()
        .references(() => users.id),
    approvedAt: timestamp("approved_at").notNull().defaultNow(),
    commitSha: text("commit_sha").notNull(), // SHA when approved
    comment: text("comment"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fileApprovalsRelations = relations(fileApprovals, ({ one }) => ({
    pullRequest: one(pullRequests, {
        fields: [fileApprovals.pullRequestId],
        references: [pullRequests.id],
    }),
    approvedBy: one(users, {
        fields: [fileApprovals.approvedById],
        references: [users.id],
    }),
}));

// ============== Change Awareness ==============

export const changeSets = pgTable("change_sets", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    createdById: text("created_by_id")
        .notNull()
        .references(() => users.id),
    status: text("status").notNull().default("draft"), // draft, in_review, approved, merged
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const changeSetItems = pgTable("change_set_items", {
    id: text("id").primaryKey(),
    changeSetId: text("change_set_id")
        .notNull()
        .references(() => changeSets.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id").references(() => pullRequests.id, { onDelete: "set null" }),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id),
    order: integer("order").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const breakingChanges = pgTable("breaking_changes", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    changeType: text("change_type").notNull(), // api, schema, config, dependency
    severity: text("severity").notNull(), // low, medium, high, critical
    description: text("description").notNull(),
    affectedFiles: jsonb("affected_files").$type<string[]>(),
    suggestedAction: text("suggested_action"),
    acknowledged: boolean("acknowledged").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const migrationDetections = pgTable("migration_detections", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    migrationType: text("migration_type").notNull(), // database, config, api, schema
    tool: text("tool"), // prisma, drizzle, alembic, flyway, liquibase
    files: jsonb("files").$type<string[]>(),
    isReversible: boolean("is_reversible"),
    requiresDowntime: boolean("requires_downtime"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============== Deployments ==============

export const deployments = pgTable("cloud_deployments", {
    id: text("id").primaryKey(),
    configId: text("config_id")
        .notNull()
        .references(() => cloudConfigs.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id"),
    commitSha: text("commit_sha").notNull(),
    environment: text("environment").notNull(), // staging, production, preview
    status: text("status").notNull(), // pending, running, success, failed, cancelled
    url: text("url"),
    logs: text("logs"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cloudConfigs = pgTable("cloud_configs", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .references(() => repositories.id, { onDelete: "cascade" }),
    organizationId: text("organization_id"),
    provider: text("provider").notNull(), // aws, gcp, azure, kubernetes, terraform
    name: text("name").notNull(),
    region: text("region"),
    credentials: jsonb("credentials").$type<Record<string, string>>(),
    settings: jsonb("settings").$type<Record<string, unknown>>(),
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============== Types ==============

export type RequiredStatusCheck = typeof requiredStatusChecks.$inferSelect;
export type MergeGate = typeof mergeGates.$inferSelect;
export type ChatIntegration = typeof chatIntegrations.$inferSelect;
export type EmailSetting = typeof emailSettings.$inferSelect;
export type CoverageReport = typeof coverageReports.$inferSelect;
export type CustomDashboard = typeof customDashboards.$inferSelect;
export type Deployment = typeof deployments.$inferSelect;
