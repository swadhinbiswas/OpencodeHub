import { relations } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { issues } from "./issues";
import { pullRequests } from "./pull-requests";
import { users } from "./users";

export const projects = pgTable("projects", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    number: integer("number").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    creatorId: text("creator_id")
        .notNull()
        .references(() => users.id),
});

export const projectColumns = pgTable("project_columns", {
    id: text("id").primaryKey(),
    projectId: text("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    order: integer("order").notNull(), // Position in the board
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectCards = pgTable("project_cards", {
    id: text("id").primaryKey(),
    columnId: text("column_id")
        .notNull()
        .references(() => projectColumns.id, { onDelete: "cascade" }),
    contentId: text("content_id"), // ID of issue or PR (optional if just a note)
    contentType: text("content_type"), // 'issue' | 'pull_request' | 'note'
    note: text("note"), // For cards that aren't issues/PRs
    order: integer("order").notNull(), // Position in the column
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    creatorId: text("creator_id")
        .notNull()
        .references(() => users.id),
});

// Relations
export const projectsRelations = relations(projects, ({ one, many }) => ({
    repository: one(repositories, {
        fields: [projects.repositoryId],
        references: [repositories.id],
    }),
    creator: one(users, {
        fields: [projects.creatorId],
        references: [users.id],
    }),
    columns: many(projectColumns),
}));

export const projectColumnsRelations = relations(projectColumns, ({ one, many }) => ({
    project: one(projects, {
        fields: [projectColumns.projectId],
        references: [projects.id],
    }),
    cards: many(projectCards),
}));

export const projectCardsRelations = relations(projectCards, ({ one }) => ({
    column: one(projectColumns, {
        fields: [projectCards.columnId],
        references: [projectColumns.id],
    }),
    creator: one(users, {
        fields: [projectCards.creatorId],
        references: [users.id],
    }),
}));
