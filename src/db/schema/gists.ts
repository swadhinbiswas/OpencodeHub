/**
 * Gists Schema - Drizzle ORM
 * GitHub-style standalone code snippets (multi-file, public or secret).
 * V1 scope: no stars, forks, or comments.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/** A single file inside a gist */
export interface GistFile {
  filename: string;
  content: string;
}

export const gists = pgTable(
  "gists",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    description: text("description").notNull().default(""),
    // false = secret (unlisted but link-accessible), true = public
    public: boolean("public").notNull().default(false),
    files: jsonb("files").$type<GistFile[]>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userUpdatedIdx: index("gists_user_updated_idx").on(t.userId, t.updatedAt),
    publicIdx: index("gists_public_idx").on(t.public),
  }),
);

// Relations
export const gistsRelations = relations(gists, ({ one }) => ({
  user: one(users, {
    fields: [gists.userId],
    references: [users.id],
  }),
}));

// Types
export type Gist = typeof gists.$inferSelect;
export type NewGist = typeof gists.$inferInsert;
