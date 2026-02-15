import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const autoMergeRules = pgTable("auto_merge_rules", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  matchLabels: text("match_labels"),
  requiredLabels: text("required_labels"),
  requiredChecks: text("required_checks"),
  minApprovals: integer("min_approvals").default(0),
  requireCodeOwner: boolean("require_code_owner").default(false),
  allowDraft: boolean("allow_draft").default(false),
  minTimeInQueueMinutes: integer("min_time_in_queue_minutes").default(0),
  mergeMethod: text("merge_method"),
  isEnabled: boolean("is_enabled").default(true),
  matchCount: integer("match_count").default(0),
  lastMatchedAt: timestamp("last_matched_at"),
  lastMismatchReason: text("last_mismatch_reason"),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AutoMergeRule = typeof autoMergeRules.$inferSelect;
