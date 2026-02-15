
/**
 * Custom Roles Schema - Drizzle ORM
 * Granular permissions for organization members
 */

import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { organizations, organizationMembers } from "./organizations";

export const customRoles = pgTable("custom_roles", {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Permissions list, e.g. ["repo:read", "repo:write", "settings:admin"]
     */
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const customRolesRelations = relations(customRoles, ({ one, many }) => ({
    organization: one(organizations, {
        fields: [customRoles.organizationId],
        references: [organizations.id],
    }),
    members: many(organizationMembers)
}));
