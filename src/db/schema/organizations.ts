/**
 * Organization Schema - Drizzle ORM
 * Defines organizations and team membership
 */

import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";
import { repositories } from "./repositories";

export const organizations = pgTable("organizations", {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(), // Handle (slug)
    displayName: text("display_name"),
    description: text("description"),
    email: text("email"),
    location: text("location"),
    website: text("website"),
    avatarUrl: text("avatar_url"),
    isVerified: boolean("is_verified").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organizationMembers = pgTable("organization_members", {
    organizationId: text("organization_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner, admin, member
    customRoleId: text("custom_role_id"), // FK to custom_roles.id added via relations logic (circular dep here if imported directly)
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.userId] }),
}));

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
    members: many(organizationMembers),
    repositories: many(repositories), // Assumes repositories will have a relation back, or we just define it here?
    // Repositories have ownerId, but it's polymorphic-ish in our logic (owner_type).
    // Drizzle doesn't support polymorphic relations natively well. 
    // We might need to handle repository ownership manually or via a separate join.
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
    organization: one(organizations, {
        fields: [organizationMembers.organizationId],
        references: [organizations.id],
    }),
    user: one(users, {
        fields: [organizationMembers.userId],
        references: [users.id],
    }),
}));
