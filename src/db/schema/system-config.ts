/**
 * System Configuration Schema - Drizzle ORM
 * Stores dynamic system settings like storage config, SMTP settings, etc.
 */

import { relations } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const systemConfig = sqliteTable("system_config", {
    key: text("key").primaryKey(), // e.g., 'storage_config'
    value: text("value").notNull(), // JSON string
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedById: text("updated_by_id").references(() => users.id),
});

export const systemConfigRelations = relations(systemConfig, ({ one }) => ({
    updatedBy: one(users, {
        fields: [systemConfig.updatedById],
        references: [users.id],
    }),
}));

export type SystemConfig = typeof systemConfig.$inferSelect;
export type NewSystemConfig = typeof systemConfig.$inferInsert;
