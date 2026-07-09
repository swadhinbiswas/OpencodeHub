-- Migration 0004: Add missing performance indexes
--
-- Adds indexes for foreign keys, status columns, and query patterns that were
-- previously unindexed. These are critical for production scale:
--   * O(N) table scans become O(log N) index lookups
--   * Merge queue, AI reviews, and CI tables are the hottest query targets
--   * Composite indexes target the specific (a, b) WHERE/ORDER patterns used
--     in dashboards, list pages, and worker pickups
--
-- All indexes are additive (CREATE INDEX) and use IF NOT EXISTS so this
-- migration is safe to re-run.
--
-- Generated to match the schema changes in src/db/schema/ for tables that
-- previously had no `index(...)` or `uniqueIndex(...)` extra-config callback.

-- ============================================================================
-- MERGE QUEUE
-- ============================================================================
CREATE INDEX IF NOT EXISTS "merge_queue_repo_status_idx" ON "merge_queue" ("repository_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merge_queue_repo_position_idx" ON "merge_queue" ("repository_id", "position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merge_queue_pr_status_idx" ON "merge_queue" ("pull_request_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merge_queue_status_idx" ON "merge_queue" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merge_queue_stack_idx" ON "merge_queue" ("stack_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merge_queue_speculative_runs_repo_idx" ON "merge_queue_speculative_runs" ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merge_queue_speculative_runs_repo_status_idx" ON "merge_queue_speculative_runs" ("repository_id", "status");--> statement-breakpoint

-- ============================================================================
-- STACKED PRS
-- ============================================================================
CREATE INDEX IF NOT EXISTS "pr_stacks_repo_idx" ON "pr_stacks" ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_stacks_repo_status_idx" ON "pr_stacks" ("repository_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_stack_entries_stack_order_idx" ON "pr_stack_entries" ("stack_id", "stack_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_stack_entries_pr_idx" ON "pr_stack_entries" ("pull_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pr_stack_entries_stack_order_uniq" ON "pr_stack_entries" ("stack_id", "stack_order");--> statement-breakpoint

-- ============================================================================
-- WORKFLOWS (CI/CD)
-- ============================================================================
CREATE INDEX IF NOT EXISTS "workflow_jobs_status_idx" ON "workflow_jobs" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_jobs_runner_idx" ON "workflow_jobs" ("runner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_steps_job_idx" ON "workflow_steps" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_steps_job_number_idx" ON "workflow_steps" ("job_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_logs_job_idx" ON "workflow_logs" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_logs_step_idx" ON "workflow_logs" ("step_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_logs_job_created_idx" ON "workflow_logs" ("job_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_artifacts_run_idx" ON "workflow_artifacts" ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_artifacts_job_idx" ON "workflow_artifacts" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_artifacts_expires_idx" ON "workflow_artifacts" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_secrets_repo_idx" ON "workflow_secrets" ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_secrets_repo_name_env_uniq" ON "workflow_secrets" ("repository_id", "name", "environment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_variables_repo_idx" ON "workflow_variables" ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_workflows_workflow_idx" ON "scheduled_workflows" ("workflow_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_workflows_enabled_next_idx" ON "scheduled_workflows" ("is_enabled", "next_run_at");--> statement-breakpoint

-- ============================================================================
-- AI REVIEWS
-- ============================================================================
CREATE INDEX IF NOT EXISTS "ai_reviews_pr_created_idx" ON "ai_reviews" ("pull_request_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_reviews_status_idx" ON "ai_reviews" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_review_suggestions_review_idx" ON "ai_review_suggestions" ("ai_review_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_review_suggestions_review_severity_idx" ON "ai_review_suggestions" ("ai_review_id", "severity");--> statement-breakpoint

-- ============================================================================
-- ISSUES
-- ============================================================================
CREATE INDEX IF NOT EXISTS "issue_labels_issue_idx" ON "issue_labels" ("issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_labels_label_idx" ON "issue_labels" ("label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "milestones_repo_idx" ON "milestones" ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "milestones_repo_state_idx" ON "milestones" ("repository_id", "state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_assignees_issue_idx" ON "issue_assignees" ("issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_assignees_user_idx" ON "issue_assignees" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_subscribers_issue_idx" ON "issue_subscribers" ("issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_subscribers_user_idx" ON "issue_subscribers" ("user_id");--> statement-breakpoint

-- ============================================================================
-- PULL REQUESTS
-- ============================================================================
CREATE INDEX IF NOT EXISTS "pr_labels_pr_idx" ON "pull_request_labels" ("pull_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_labels_label_idx" ON "pull_request_labels" ("label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_assignees_pr_idx" ON "pull_request_assignees" ("pull_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_assignees_user_idx" ON "pull_request_assignees" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_reviewers_pr_idx" ON "pull_request_reviewers" ("pull_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_reviewers_user_idx" ON "pull_request_reviewers" ("user_id");--> statement-breakpoint

-- ============================================================================
-- ORGS / TEAMS
-- ============================================================================
CREATE INDEX IF NOT EXISTS "organizations_display_name_idx" ON "organizations" ("display_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_members_user_idx" ON "organization_members" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_members_org_role_idx" ON "organization_members" ("organization_id", "role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_org_idx" ON "teams" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_org_slug_uniq" ON "teams" ("organization_id", "slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_members_user_idx" ON "team_members" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_repositories_repo_idx" ON "team_repositories" ("repository_id");--> statement-breakpoint

-- ============================================================================
-- PROJECTS
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "projects_repo_number_uniq" ON "projects" ("repository_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_repo_idx" ON "projects" ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_columns_project_idx" ON "project_columns" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_columns_project_order_idx" ON "project_columns" ("project_id", "order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_cards_column_idx" ON "project_cards" ("column_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_cards_column_order_idx" ON "project_cards" ("column_id", "order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_cards_content_idx" ON "project_cards" ("content_type", "content_id");--> statement-breakpoint

-- ============================================================================
-- WIKI
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "wiki_pages_repo_slug_uniq" ON "wiki_pages" ("repository_id", "slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wiki_pages_repo_order_idx" ON "wiki_pages" ("repository_id", "order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wiki_pages_parent_idx" ON "wiki_pages" ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wiki_revisions_page_created_idx" ON "wiki_revisions" ("page_id", "created_at");--> statement-breakpoint

-- ============================================================================
-- SECURITY
-- ============================================================================
CREATE INDEX IF NOT EXISTS "security_scans_repo_idx" ON "security_scans" ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_scans_repo_status_idx" ON "security_scans" ("repository_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_vulns_scan_severity_idx" ON "security_vulnerabilities" ("scan_id", "severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_vulns_vuln_id_idx" ON "security_vulnerabilities" ("vulnerability_id");--> statement-breakpoint

-- ============================================================================
-- WEBHOOKS
-- Add encrypted-at-rest secret + display hint columns. The legacy `secret`
-- column previously stored a SHA-256 hash, which is unusable as an HMAC key;
-- see src/lib/webhooks.ts resolveSigningSecret() for the compat shim.
-- ============================================================================
ALTER TABLE "webhooks" ADD COLUMN IF NOT EXISTS "secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN IF NOT EXISTS "secret_hint" text;--> statement-breakpoint

-- ============================================================================
-- AUTOMATIONS
-- ============================================================================
CREATE INDEX IF NOT EXISTS "automation_rules_trigger_enabled_idx" ON "automation_rules" ("trigger", "is_enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_rules_repo_idx" ON "automation_rules" ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_rules_org_idx" ON "automation_rules" ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_executions_rule_created_idx" ON "automation_executions" ("rule_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_executions_status_idx" ON "automation_executions" ("status");--> statement-breakpoint

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "notification_prefs_user_event_uniq" ON "notification_preferences" ("user_id", "event_type", "repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_prefs_repo_idx" ON "notification_preferences" ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_quiet_hours_user_uniq" ON "notification_quiet_hours" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_active_idx" ON "push_subscriptions" ("user_id", "is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_uniq" ON "push_subscriptions" ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_digest_settings_user_uniq" ON "email_digest_settings" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_digest_settings_digest_type_idx" ON "email_digest_settings" ("digest_type");--> statement-breakpoint

-- ============================================================================
-- PR STATES
-- ============================================================================
CREATE INDEX IF NOT EXISTS "pr_state_defs_repo_order_idx" ON "pr_state_definitions" ("repository_id", "order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_state_reviewers_state_idx" ON "pr_state_reviewers" ("state_definition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_state_reviewers_user_idx" ON "pr_state_reviewers" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_state_reviewers_team_idx" ON "pr_state_reviewers" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_state_transitions_pr_created_idx" ON "pr_state_transitions" ("pull_request_id", "created_at");--> statement-breakpoint

-- ============================================================================
-- BRANCH PROTECTION
-- ============================================================================
CREATE INDEX IF NOT EXISTS "branch_protection_repo_pattern_idx" ON "branch_protection" ("repository_id", "pattern");--> statement-breakpoint

-- ============================================================================
-- DEPLOY KEYS
-- ============================================================================
CREATE INDEX IF NOT EXISTS "deploy_keys_repo_idx" ON "deploy_keys" ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deploy_keys_fingerprint_uniq" ON "deploy_keys" ("fingerprint");--> statement-breakpoint

-- ============================================================================
-- PIPELINE RUNNERS
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "pipeline_runners_token_uniq" ON "pipeline_runners" ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runners_status_last_seen_idx" ON "pipeline_runners" ("status", "last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runners_repo_idx" ON "pipeline_runners" ("repository_id");--> statement-breakpoint

-- ============================================================================
-- EXTERNAL CI
-- ============================================================================
CREATE INDEX IF NOT EXISTS "external_ci_repo_idx" ON "external_ci_integrations" ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_ci_token_hash_uniq" ON "external_ci_integrations" ("token_hash");--> statement-breakpoint

-- ============================================================================
-- AUTO MERGE RULES
-- ============================================================================
CREATE INDEX IF NOT EXISTS "auto_merge_rules_repo_enabled_idx" ON "auto_merge_rules" ("repository_id", "is_enabled");--> statement-breakpoint

-- ============================================================================
-- REVIEW RULES
-- ============================================================================
CREATE INDEX IF NOT EXISTS "review_requirements_repo_idx" ON "review_requirements" ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviewer_rules_repo_enabled_idx" ON "reviewer_rules" ("repository_id", "is_enabled");--> statement-breakpoint

-- ============================================================================
-- SECURITY POLICIES
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "security_policies_repo_uniq" ON "security_policies" ("repository_id");--> statement-breakpoint

-- ============================================================================
-- SSO
-- ============================================================================
CREATE INDEX IF NOT EXISTS "sso_configs_org_idx" ON "sso_configs" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sso_configs_issuer_uniq" ON "sso_configs" ("issuer");--> statement-breakpoint

-- ============================================================================
-- PATH PERMISSIONS
-- ============================================================================
CREATE INDEX IF NOT EXISTS "repo_path_perms_repo_pattern_idx" ON "repository_path_permissions" ("repository_id", "path_pattern");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repo_path_perms_user_idx" ON "repository_path_permissions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repo_path_perms_team_idx" ON "repository_path_permissions" ("team_id");--> statement-breakpoint

-- ============================================================================
-- INBOX SECTIONS
-- ============================================================================
CREATE INDEX IF NOT EXISTS "inbox_sections_user_position_idx" ON "inbox_sections" ("user_id", "position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_inbox_sections_section_idx" ON "shared_inbox_sections" ("section_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_inbox_sections_user_idx" ON "shared_inbox_sections" ("shared_with_user_id");--> statement-breakpoint

-- ============================================================================
-- CUSTOM FIELDS
-- ============================================================================
CREATE INDEX IF NOT EXISTS "custom_field_defs_repo_order_idx" ON "custom_field_definitions" ("repository_id", "order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_custom_field_values_issue_idx" ON "issue_custom_field_values" ("issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_custom_field_values_field_idx" ON "issue_custom_field_values" ("field_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issue_custom_field_values_issue_field_uniq" ON "issue_custom_field_values" ("issue_id", "field_id");--> statement-breakpoint

-- ============================================================================
-- ISSUE STATUSES
-- ============================================================================
CREATE INDEX IF NOT EXISTS "issue_statuses_repo_order_idx" ON "issue_statuses" ("repository_id", "order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issue_statuses_repo_name_uniq" ON "issue_statuses" ("repository_id", "name");--> statement-breakpoint

-- ============================================================================
-- ROLES
-- ============================================================================
CREATE INDEX IF NOT EXISTS "custom_roles_org_idx" ON "custom_roles" ("organization_id");--> statement-breakpoint

-- ============================================================================
-- SYSTEM CONFIG
-- ============================================================================
CREATE INDEX IF NOT EXISTS "system_config_updated_by_idx" ON "system_config" ("updated_by_id");--> statement-breakpoint

-- ============================================================================
-- DEVELOPER METRICS
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "pr_metrics_pr_uniq" ON "pr_metrics" ("pull_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_metrics_author_created_idx" ON "pr_metrics" ("author_id", "pr_created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_metrics_repo_created_idx" ON "pr_metrics" ("repository_id", "pr_created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_metrics_user_week_uniq" ON "review_metrics" ("user_id", "week_of");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "repo_metrics_repo_week_uniq" ON "repo_metrics" ("repository_id", "week_of");--> statement-breakpoint

-- ============================================================================
-- AI REVIEW RULES
-- ============================================================================
CREATE INDEX IF NOT EXISTS "ai_review_rules_repo_enabled_idx" ON "ai_review_rules" ("repository_id", "is_enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_review_rules_org_idx" ON "ai_review_rules" ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_codebase_context_repo_idx" ON "ai_codebase_context" ("repository_id");--> statement-breakpoint

-- ============================================================================
-- SLACK INTEGRATION
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "slack_workspaces_team_id_uniq" ON "slack_workspaces" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slack_channel_mappings_repo_idx" ON "slack_channel_mappings" ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slack_channel_mappings_workspace_idx" ON "slack_channel_mappings" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "slack_user_mappings_user_workspace_uniq" ON "slack_user_mappings" ("user_id", "workspace_id");--> statement-breakpoint
