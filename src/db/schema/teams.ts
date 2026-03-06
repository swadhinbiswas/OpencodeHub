/**
 * Teams Schema - Drizzle ORM
 * Defines teams within organizations
 */

import { relations } from "drizzle-orm";
import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { repositories } from "./repositories";
import { users } from "./users";

/**
 * Teams table - groups within organizations
 */
export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  privacy: text("privacy").default("visible"), // visible, secret
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Team members - users belonging to teams
 */
export const teamMembers = pgTable(
  "team_members",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // maintainer, member
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.userId] }),
  }),
);

/**
 * Team-Repository mappings — controls team access to repositories
 */
export const teamRepositories = pgTable(
  "team_repositories",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    permission: text("permission").notNull().default("read"), // admin, write, read
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.repositoryId] }),
  }),
);

// Relations
export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
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
  }),
);

// Types
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type TeamRepository = typeof teamRepositories.$inferSelect;
