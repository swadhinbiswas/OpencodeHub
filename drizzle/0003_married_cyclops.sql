CREATE TABLE "team_members" (
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"privacy" text DEFAULT 'visible',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_path_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"path_pattern" text NOT NULL,
	"user_id" text,
	"team_id" text,
	"permission" text DEFAULT 'write' NOT NULL,
	"require_approval" text DEFAULT 'false',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pr_state_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"icon" text,
	"order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false,
	"is_final" boolean DEFAULT false,
	"allow_merge" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pr_state_reviewers" (
	"id" text PRIMARY KEY NOT NULL,
	"state_definition_id" text NOT NULL,
	"user_id" text,
	"team_id" text,
	"required_count" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pr_state_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"changed_by_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breaking_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"change_type" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"affected_files" jsonb,
	"suggested_action" text,
	"acknowledged" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_set_items" (
	"id" text PRIMARY KEY NOT NULL,
	"change_set_id" text NOT NULL,
	"pull_request_id" text,
	"repository_id" text NOT NULL,
	"order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"repository_id" text,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"webhook_url" text,
	"api_token" text,
	"channel_id" text,
	"is_enabled" boolean DEFAULT true,
	"events" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text,
	"organization_id" text,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"region" text,
	"credentials" jsonb,
	"settings" jsonb,
	"is_enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_quality_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"provider" text NOT NULL,
	"project_key" text,
	"api_token" text,
	"server_url" text,
	"webhook_secret" text,
	"is_enabled" boolean DEFAULT true,
	"report_on_pr" boolean DEFAULT true,
	"block_on_fail" boolean DEFAULT false,
	"min_coverage" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_quality_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pull_request_id" text,
	"commit_sha" text NOT NULL,
	"provider" text NOT NULL,
	"issue_type" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"file" text,
	"line" integer,
	"rule" text,
	"effort" text,
	"status" text DEFAULT 'open',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pull_request_id" text,
	"commit_sha" text NOT NULL,
	"provider" text NOT NULL,
	"coverage" real NOT NULL,
	"lines_covered" integer,
	"lines_total" integer,
	"branch_coverage" real,
	"delta" real,
	"status" text NOT NULL,
	"report_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cross_repo_issue_links" (
	"id" text PRIMARY KEY NOT NULL,
	"source_issue_id" text NOT NULL,
	"target_issue_id" text NOT NULL,
	"link_type" text NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_dashboards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false,
	"layout" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"name" text NOT NULL,
	"field_type" text NOT NULL,
	"description" text,
	"is_required" boolean DEFAULT false,
	"options" text,
	"default_value" text,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_values" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"field_id" text NOT NULL,
	"value" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_widgets" (
	"id" text PRIMARY KEY NOT NULL,
	"dashboard_id" text NOT NULL,
	"widget_type" text NOT NULL,
	"title" text NOT NULL,
	"config" jsonb,
	"position" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"pull_request_id" text,
	"commit_sha" text NOT NULL,
	"environment" text NOT NULL,
	"status" text NOT NULL,
	"url" text,
	"logs" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"smtp_host" text,
	"smtp_port" text,
	"smtp_user" text,
	"smtp_pass" text,
	"from_address" text,
	"from_name" text,
	"is_enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_builds" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"pull_request_id" text,
	"external_build_id" text NOT NULL,
	"build_number" text,
	"status" text NOT NULL,
	"url" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_ci_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"api_token" text,
	"project_id" text,
	"webhook_secret" text,
	"is_enabled" boolean DEFAULT true,
	"sync_status" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"path" text NOT NULL,
	"approved_by_id" text NOT NULL,
	"approved_at" timestamp DEFAULT now() NOT NULL,
	"commit_sha" text NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_hotspots" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"file_path" text NOT NULL,
	"change_count" integer DEFAULT 0,
	"bug_count" integer DEFAULT 0,
	"review_count" integer DEFAULT 0,
	"complexity_score" real,
	"last_modified" timestamp,
	"calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_allow_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"cidr_block" text NOT NULL,
	"description" text,
	"is_enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_tracker_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"api_url" text,
	"api_token" text,
	"project_key" text,
	"webhook_secret" text,
	"is_enabled" boolean DEFAULT true,
	"sync_to_external" boolean DEFAULT true,
	"sync_from_external" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_tracker_links" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"local_issue_id" text,
	"external_id" text NOT NULL,
	"external_key" text,
	"external_url" text,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"commit_sha" text NOT NULL,
	"package_name" text NOT NULL,
	"package_version" text,
	"license" text NOT NULL,
	"license_type" text NOT NULL,
	"is_compliant" boolean NOT NULL,
	"policy_violation" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merge_gates" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"gate_type" text NOT NULL,
	"config" text,
	"condition_script" text,
	"is_enabled" boolean DEFAULT true,
	"order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text,
	"organization_id" text,
	"metric_type" text NOT NULL,
	"value" real NOT NULL,
	"dimensions" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_detections" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"migration_type" text NOT NULL,
	"tool" text,
	"files" jsonb,
	"is_reversible" boolean,
	"requires_downtime" boolean,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pr_issue_links" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"link_type" text NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"key" text NOT NULL,
	"request_count" integer NOT NULL,
	"window_start" timestamp NOT NULL,
	"blocked" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "rate_limit_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"method" text,
	"window_ms" integer NOT NULL,
	"max_requests" integer NOT NULL,
	"key_type" text DEFAULT 'ip',
	"is_enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"template_id" text,
	"is_enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "required_status_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"branch" text NOT NULL,
	"check_name" text NOT NULL,
	"is_required" boolean DEFAULT true,
	"strict_mode" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"content" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saml_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"sso_url" text NOT NULL,
	"certificate" text NOT NULL,
	"signature_algorithm" text DEFAULT 'RSA-SHA256',
	"digest_algorithm" text DEFAULT 'SHA256',
	"is_enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret_scan_results" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"commit_sha" text NOT NULL,
	"secret_type" text NOT NULL,
	"file" text NOT NULL,
	"line" integer,
	"snippet" text,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open',
	"resolved_at" timestamp,
	"resolved_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_states" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"color" text DEFAULT '#6b7280',
	"icon" text,
	"display_order" integer DEFAULT 0,
	"is_default" boolean DEFAULT false,
	"is_closed_state" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"language" text,
	"content" text NOT NULL,
	"is_official" boolean DEFAULT false,
	"is_public" boolean DEFAULT true,
	"created_by_id" text,
	"downloads" text DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"from_state_id" text,
	"to_state_id" text NOT NULL,
	"requires_comment" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deploy_keys" ALTER COLUMN "read_only" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deploy_keys" ADD COLUMN "fingerprint" text NOT NULL;--> statement-breakpoint
ALTER TABLE "deploy_keys" ADD COLUMN "last_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "is_template" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "last_mirror_sync_at" timestamp;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "mirror_sync_status" text;--> statement-breakpoint
ALTER TABLE "pull_request_checks" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "pull_request_checks" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "auto_merge_enabled_by_id" text;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "auto_merge_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "custom_state" text;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "custom_state_changed_at" timestamp;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_path_permissions" ADD CONSTRAINT "repository_path_permissions_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_path_permissions" ADD CONSTRAINT "repository_path_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_path_permissions" ADD CONSTRAINT "repository_path_permissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_state_definitions" ADD CONSTRAINT "pr_state_definitions_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_state_reviewers" ADD CONSTRAINT "pr_state_reviewers_state_definition_id_pr_state_definitions_id_fk" FOREIGN KEY ("state_definition_id") REFERENCES "public"."pr_state_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_state_reviewers" ADD CONSTRAINT "pr_state_reviewers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_state_reviewers" ADD CONSTRAINT "pr_state_reviewers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_state_transitions" ADD CONSTRAINT "pr_state_transitions_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaking_changes" ADD CONSTRAINT "breaking_changes_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_set_items" ADD CONSTRAINT "change_set_items_change_set_id_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."change_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_set_items" ADD CONSTRAINT "change_set_items_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_set_items" ADD CONSTRAINT "change_set_items_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_configs" ADD CONSTRAINT "cloud_configs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_quality_configs" ADD CONSTRAINT "code_quality_configs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_quality_issues" ADD CONSTRAINT "code_quality_issues_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_reports" ADD CONSTRAINT "coverage_reports_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_repo_issue_links" ADD CONSTRAINT "cross_repo_issue_links_source_issue_id_issues_id_fk" FOREIGN KEY ("source_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_repo_issue_links" ADD CONSTRAINT "cross_repo_issue_links_target_issue_id_issues_id_fk" FOREIGN KEY ("target_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_dashboards" ADD CONSTRAINT "custom_dashboards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_field_id_custom_field_definitions_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboard_id_custom_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."custom_dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_deployments" ADD CONSTRAINT "cloud_deployments_config_id_cloud_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."cloud_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_builds" ADD CONSTRAINT "external_builds_config_id_external_ci_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."external_ci_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_ci_configs" ADD CONSTRAINT "external_ci_configs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_approvals" ADD CONSTRAINT "file_approvals_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_approvals" ADD CONSTRAINT "file_approvals_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_hotspots" ADD CONSTRAINT "file_hotspots_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_tracker_configs" ADD CONSTRAINT "issue_tracker_configs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_tracker_links" ADD CONSTRAINT "issue_tracker_links_config_id_issue_tracker_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."issue_tracker_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_tracker_links" ADD CONSTRAINT "issue_tracker_links_local_issue_id_issues_id_fk" FOREIGN KEY ("local_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_scans" ADD CONSTRAINT "license_scans_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_gates" ADD CONSTRAINT "merge_gates_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_detections" ADD CONSTRAINT "migration_detections_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_issue_links" ADD CONSTRAINT "pr_issue_links_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_issue_links" ADD CONSTRAINT "pr_issue_links_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_limit_logs" ADD CONSTRAINT "rate_limit_logs_rule_id_rate_limit_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rate_limit_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_workflows" ADD CONSTRAINT "repository_workflows_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_workflows" ADD CONSTRAINT "repository_workflows_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "required_status_checks" ADD CONSTRAINT "required_status_checks_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_templates" ADD CONSTRAINT "review_templates_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_scan_results" ADD CONSTRAINT "secret_scan_results_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_states" ADD CONSTRAINT "workflow_states_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_from_state_id_workflow_states_id_fk" FOREIGN KEY ("from_state_id") REFERENCES "public"."workflow_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_to_state_id_workflow_states_id_fk" FOREIGN KEY ("to_state_id") REFERENCES "public"."workflow_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_auto_merge_enabled_by_id_users_id_fk" FOREIGN KEY ("auto_merge_enabled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;