/**
 * Wiki Schema - Drizzle ORM
 * Defines wiki pages and revisions
 */

import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const wikiPages = sqliteTable("wiki_pages", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  format: text("format").notNull().default("markdown"), // markdown, asciidoc, rst
  parentId: text("parent_id").references(() => wikiPages.id),
  order: integer("order").default(0),
  lastEditorId: text("last_editor_id").references(() => users.id),
  viewCount: integer("view_count").default(0),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const wikiRevisions = sqliteTable("wiki_revisions", {
  id: text("id").primaryKey(),
  pageId: text("page_id")
    .notNull()
    .references(() => wikiPages.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  message: text("message"),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Relations
export const wikiPagesRelations = relations(wikiPages, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [wikiPages.repositoryId],
    references: [repositories.id],
  }),
  parent: one(wikiPages, {
    fields: [wikiPages.parentId],
    references: [wikiPages.id],
  }),
  children: many(wikiPages),
  revisions: many(wikiRevisions),
  lastEditor: one(users, {
    fields: [wikiPages.lastEditorId],
    references: [users.id],
  }),
}));

export const wikiRevisionsRelations = relations(wikiRevisions, ({ one }) => ({
  page: one(wikiPages, {
    fields: [wikiRevisions.pageId],
    references: [wikiPages.id],
  }),
  author: one(users, {
    fields: [wikiRevisions.authorId],
    references: [users.id],
  }),
}));

// Types
export type WikiPage = typeof wikiPages.$inferSelect;
export type WikiRevision = typeof wikiRevisions.$inferSelect;
