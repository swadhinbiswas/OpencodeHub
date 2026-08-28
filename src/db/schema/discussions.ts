/**
 * Discussions Schema - Drizzle ORM
 * GitHub-style repository discussions and threaded comments
 */

import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const DISCUSSION_CATEGORIES = [
  "General",
  "Ideas",
  "Q&A",
  "Show and tell",
] as const;

export type DiscussionCategory = (typeof DISCUSSION_CATEGORIES)[number];

export const discussions = pgTable(
  "discussions",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: text("category").notNull().default("General"),
    pinned: boolean("pinned").default(false),
    closed: boolean("closed").default(false),
    commentCount: integer("comment_count").default(0),
    lastActivityAt: timestamp("last_activity_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    repoClosedIdx: index("discussions_repo_closed_idx").on(
      t.repositoryId,
      t.closed,
    ),
    repoActivityIdx: index("discussions_repo_activity_idx").on(
      t.repositoryId,
      t.lastActivityAt,
    ),
    authorIdx: index("discussions_author_idx").on(t.authorId),
  }),
);

export const discussionComments = pgTable(
  "discussion_comments",
  {
    id: text("id").primaryKey(),
    discussionId: text("discussion_id")
      .notNull()
      .references(() => discussions.id, { onDelete: "cascade" }),
    // Self-reference for one-level threading; stored but treated flat in UI v1.
    // Plain text column (no FK) mirrors the issues.parent_id convention to avoid
    // circular type references in Drizzle.
    parentId: text("parent_id"),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    discussionIdx: index("discussion_comments_discussion_idx").on(
      t.discussionId,
    ),
    parentIdx: index("discussion_comments_parent_idx").on(t.parentId),
  }),
);

// Types
export type Discussion = typeof discussions.$inferSelect;
export type NewDiscussion = typeof discussions.$inferInsert;
export type DiscussionComment = typeof discussionComments.$inferSelect;
export type NewDiscussionComment = typeof discussionComments.$inferInsert;
