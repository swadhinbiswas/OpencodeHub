/**
 * File-level Permissions Schema
 * Path-based access control for monorepo support
 */

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { repositories } from "./repositories";
import { users } from "./users";
import { teams } from "./teams";

/**
 * Repository path permissions
 * Defines granular access control for specific file paths
 */
export const repositoryPathPermissions = pgTable("repository_path_permissions", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    pathPattern: text("path_pattern").notNull(), // e.g., "packages/frontend/**", "src/api/*"

    // Permission target - either user or team
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),

    // Permission level
    permission: text("permission").notNull().default("write"), // read, write, admin

    // Whether this permission is required for merging (CODEOWNERS-style)
    requireApproval: text("require_approval").default("false"), // true, false

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Relations
 */
export const repositoryPathPermissionsRelations = relations(repositoryPathPermissions, ({ one }) => ({
    repository: one(repositories, {
        fields: [repositoryPathPermissions.repositoryId],
        references: [repositories.id],
    }),
    user: one(users, {
        fields: [repositoryPathPermissions.userId],
        references: [users.id],
    }),
    team: one(teams, {
        fields: [repositoryPathPermissions.teamId],
        references: [teams.id],
    }),
}));

// Types
export type RepositoryPathPermission = typeof repositoryPathPermissions.$inferSelect;
export type NewRepositoryPathPermission = typeof repositoryPathPermissions.$inferInsert;
