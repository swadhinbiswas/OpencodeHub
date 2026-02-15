import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const reviewRequirements = pgTable("review_requirements", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  minApprovals: integer("min_approvals").default(1),
  requireCodeOwner: boolean("require_code_owner").default(false),
  requireTeamLead: boolean("require_team_lead").default(false),
  dismissStaleReviews: boolean("dismiss_stale_reviews").default(false),
  requireReReviewOnPush: boolean("require_rereview_on_push").default(false),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const reviewerRules = pgTable("reviewer_rules", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ruleType: text("rule_type").notNull(), // user, team, codeowner, random
  targetId: text("target_id"),
  count: integer("count"),
  pathPattern: text("path_pattern"),
  isRequired: boolean("is_required").default(true),
  isEnabled: boolean("is_enabled").default(true),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ReviewRequirement = typeof reviewRequirements.$inferSelect;
export type ReviewerRule = typeof reviewerRules.$inferSelect;
