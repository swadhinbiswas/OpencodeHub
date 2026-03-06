import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const securityPolicies = pgTable("security_policies", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  enforcementMode: text("enforcement_mode").notNull().default("warn"), // warn | block
  secretBlockedTypes: text("secret_blocked_types").notNull().default("[]"), // JSON string[]
  secretMinSeverity: text("secret_min_severity").notNull().default("HIGH"), // CRITICAL | HIGH | MEDIUM | LOW | UNKNOWN
  licenseAllowedTypes: text("license_allowed_types").notNull().default("[\"permissive\"]"), // JSON string[]
  licenseBlockedLicenses: text("license_blocked_licenses").notNull().default("[]"), // JSON string[]
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedById: text("updated_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SecurityPolicy = typeof securityPolicies.$inferSelect;

