import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const externalCiIntegrations = pgTable("external_ci_integrations", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  name: text("name"),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export type ExternalCiIntegration = typeof externalCiIntegrations.$inferSelect;
