/**
 * System Configuration Schema - Drizzle ORM
 * Stores dynamic system settings like storage config, SMTP settings, etc.
 */

import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const systemConfig = pgTable("system_config", {
    key: text("key").primaryKey(), // e.g., 'storage_config'
    value: text("value").notNull(), // JSON string
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
