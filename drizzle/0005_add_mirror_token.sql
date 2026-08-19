ALTER TABLE "repositories" ADD COLUMN "mirror_token" text;--> statement-breakpoint
CREATE INDEX "deploy_keys_repository_id_idx" ON "deploy_keys" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "pr_reviewers_pr_idx" ON "pull_request_reviewers" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "pr_stack_entries_stack_idx" ON "pr_stack_entries" USING btree ("stack_id");--> statement-breakpoint
CREATE INDEX "pr_stack_entries_pr_idx" ON "pr_stack_entries" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "pr_stack_entries_parent_pr_idx" ON "pr_stack_entries" USING btree ("parent_pr_id");--> statement-breakpoint
CREATE INDEX "pr_stacks_repo_idx" ON "pr_stacks" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "merge_queue_repo_idx" ON "merge_queue" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "merge_queue_status_idx" ON "merge_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "merge_queue_pr_idx" ON "merge_queue" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "ai_reviews_pull_request_id_idx" ON "ai_reviews" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "branch_protection_repository_id_idx" ON "branch_protection" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "automation_rules_repository_id_idx" ON "automation_rules" USING btree ("repository_id");