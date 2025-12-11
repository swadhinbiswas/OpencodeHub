/**
 * Organizations Schema - Drizzle ORM
 * Defines organizations, teams, and memberships
 */

import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name"),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  website: text("website"),
  location: text("location"),
  email: text("email"),
  isVerified: integer("is_verified", { mode: "boolean" }).default(false),
  visibility: text("visibility").notNull().default("public"), // public, private
  defaultRepoPermission: text("default_repo_permission").default("read"), // none, read, write, admin
  membersCanCreateRepos: integer("members_can_create_repos", {
    mode: "boolean",
  }).default(true),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const organizationMembers = sqliteTable("organization_members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // owner, admin, member
  joinedAt: text("joined_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  privacy: text("privacy").notNull().default("visible"), // visible, secret
  parentId: text("parent_id").references(() => teams.id),
  permission: text("permission").notNull().default("read"), // none, read, write, maintain, admin
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // maintainer, member
  joinedAt: text("joined_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const teamRepositories = sqliteTable("team_repositories", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  permission: text("permission").notNull().default("read"), // read, write, maintain, admin
  addedAt: text("added_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  teams: many(teams),
}));

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [organizationMembers.userId],
      references: [users.id],
    }),
  })
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
  parent: one(teams, {
    fields: [teams.parentId],
    references: [teams.id],
  }),
  children: many(teams),
  members: many(teamMembers),
  repositories: many(teamRepositories),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));

export const teamRepositoriesRelations = relations(
  teamRepositories,
  ({ one }) => ({
    team: one(teams, {
      fields: [teamRepositories.teamId],
      references: [teams.id],
    }),
    repository: one(repositories, {
      fields: [teamRepositories.repositoryId],
      references: [repositories.id],
    }),
  })
);

// Types
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
