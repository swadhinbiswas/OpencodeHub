CREATE TABLE "project_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"column_id" text NOT NULL,
	"content_id" text,
	"content_type" text,
	"note" text,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"creator_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_columns" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"creator_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merge_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pull_request_id" text NOT NULL,
	"stack_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0,
	"position" integer DEFAULT 0,
	"ci_status" text DEFAULT 'pending',
	"merge_method" text DEFAULT 'merge',
	"delete_on_merge" boolean DEFAULT true,
	"execution_branch" text,
	"attempt_count" integer DEFAULT 0,
	"last_attempt_at" timestamp,
	"added_by_id" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"queued_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "merge_queue_speculative_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pull_request_ids" text NOT NULL,
	"branch_name" text NOT NULL,
	"base_branch" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"ci_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"failure_reason" text,
	"commit_sha" text
);
--> statement-breakpoint
CREATE TABLE "sso_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'oidc' NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"scopes" text DEFAULT 'openid,profile,email',
	"authorization_url" text,
	"token_url" text,
	"userinfo_url" text,
	"jwks_uri" text,
	"enabled" boolean DEFAULT false,
	"auto_create_users" boolean DEFAULT true,
	"allowed_domains" text,
	"default_role" text DEFAULT 'member',
	"organization_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text
);
--> statement-breakpoint
ALTER TABLE "scheduled_workflows" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_artifacts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_jobs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_logs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_runs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_secrets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_steps" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_variables" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflows" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "merge_queue_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "scheduled_workflows" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_artifacts" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_jobs" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_logs" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_runs" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_secrets" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_steps" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_variables" CASCADE;--> statement-breakpoint
DROP TABLE "workflows" CASCADE;--> statement-breakpoint
DROP TABLE "merge_queue_items" CASCADE;--> statement-breakpoint
ALTER TABLE "pull_request_comments" ADD COLUMN "suggestion_content" text;--> statement-breakpoint
ALTER TABLE "pull_request_comments" ADD COLUMN "suggestion_applied" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "pull_request_comments" ADD COLUMN "suggestion_applied_by_id" text;--> statement-breakpoint
ALTER TABLE "pull_request_comments" ADD COLUMN "suggestion_applied_at" timestamp;--> statement-breakpoint
ALTER TABLE "pull_request_comments" ADD COLUMN "suggestion_commit_sha" text;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "provider" text DEFAULT 'generic';--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "project_cards" ADD CONSTRAINT "project_cards_column_id_project_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."project_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_cards" ADD CONSTRAINT "project_cards_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_columns" ADD CONSTRAINT "project_columns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_queue" ADD CONSTRAINT "merge_queue_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_queue" ADD CONSTRAINT "merge_queue_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_queue" ADD CONSTRAINT "merge_queue_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_queue_speculative_runs" ADD CONSTRAINT "merge_queue_speculative_runs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_configs" ADD CONSTRAINT "sso_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_comments" ADD CONSTRAINT "pull_request_comments_suggestion_applied_by_id_users_id_fk" FOREIGN KEY ("suggestion_applied_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;