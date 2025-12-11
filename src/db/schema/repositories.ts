/**
 * Repository Schema - Drizzle ORM
 * Defines repositories, branches, commits, tags
 */

import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const repositories = sqliteTable("repositories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ownerType: text("owner_type").notNull().default("user"), // user, organization
  visibility: text("visibility").notNull().default("public"), // public, private, internal
  defaultBranch: text("default_branch").notNull().default("main"),
  diskPath: text("disk_path").notNull(),
  sshCloneUrl: text("ssh_clone_url"),
  httpCloneUrl: text("http_clone_url"),
  starCount: integer("star_count").default(0),
  forkCount: integer("fork_count").default(0),
  watchCount: integer("watch_count").default(0),
  openIssueCount: integer("open_issue_count").default(0),
  openPrCount: integer("open_pr_count").default(0),
  size: integer("size").default(0), // Size in KB
  isFork: integer("is_fork", { mode: "boolean" }).default(false),
  forkedFromId: text("forked_from_id").references(() => repositories.id),
  isArchived: integer("is_archived", { mode: "boolean" }).default(false),
  isMirror: integer("is_mirror", { mode: "boolean" }).default(false),
  mirrorUrl: text("mirror_url"),
  hasIssues: integer("has_issues", { mode: "boolean" }).default(true),
  hasWiki: integer("has_wiki", { mode: "boolean" }).default(true),
  hasActions: integer("has_actions", { mode: "boolean" }).default(true),
  allowForking: integer("allow_forking", { mode: "boolean" }).default(true),
  licenseType: text("license_type"),
  topics: text("topics"), // JSON array
  language: text("language"), // Primary language
  languages: text("languages"), // JSON object { lang: percentage }
  lastActivityAt: text("last_activity_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  commitSha: text("commit_sha").notNull(),
  isProtected: integer("is_protected", { mode: "boolean" }).default(false),
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  protectionRules: text("protection_rules"), // JSON
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const commits = sqliteTable("commits", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  sha: text("sha").notNull(),
  message: text("message").notNull(),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email").notNull(),
  authorDate: text("author_date").notNull(),
  committerName: text("committer_name").notNull(),
  committerEmail: text("committer_email").notNull(),
  committerDate: text("committer_date").notNull(),
  parentShas: text("parent_shas"), // JSON array
  treesha: text("tree_sha"),
  userId: text("user_id").references(() => users.id),
  stats: text("stats"), // JSON { additions, deletions, files_changed }
  signature: text("signature"), // GPG signature
  isVerified: integer("is_verified", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  commitSha: text("commit_sha").notNull(),
  message: text("message"),
  taggerName: text("tagger_name"),
  taggerEmail: text("tagger_email"),
  taggedAt: text("tagged_at"),
  isRelease: integer("is_release", { mode: "boolean" }).default(false),
  releaseId: text("release_id"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const releases = sqliteTable("releases", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  tagId: text("tag_id").references(() => tags.id),
  name: text("name").notNull(),
  body: text("body"),
  isDraft: integer("is_draft", { mode: "boolean" }).default(false),
  isPrerelease: integer("is_prerelease", { mode: "boolean" }).default(false),
  authorId: text("author_id").references(() => users.id),
  assets: text("assets"), // JSON array of asset metadata
  downloadCount: integer("download_count").default(0),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const repositoryStars = sqliteTable("repository_stars", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const repositoryWatchers = sqliteTable("repository_watchers", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  watchLevel: text("watch_level").notNull().default("watching"), // watching, releases_only, ignoring
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const repositoryCollaborators = sqliteTable("repository_collaborators", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("developer"), // owner, maintainer, developer, guest
  addedById: text("added_by_id").references(() => users.id),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret"),
  events: text("events").notNull(), // JSON array
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  lastDeliveryAt: text("last_delivery_at"),
  lastDeliveryStatus: integer("last_delivery_status"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Relations
export const repositoriesRelations = relations(
  repositories,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [repositories.ownerId],
      references: [users.id],
    }),
    forkedFrom: one(repositories, {
      fields: [repositories.forkedFromId],
      references: [repositories.id],
    }),
    branches: many(branches),
    commits: many(commits),
    tags: many(tags),
    releases: many(releases),
    stars: many(repositoryStars),
    watchers: many(repositoryWatchers),
    collaborators: many(repositoryCollaborators),
    webhooks: many(webhooks),
  })
);

export const branchesRelations = relations(branches, ({ one }) => ({
  repository: one(repositories, {
    fields: [branches.repositoryId],
    references: [repositories.id],
  }),
}));

export const commitsRelations = relations(commits, ({ one }) => ({
  repository: one(repositories, {
    fields: [commits.repositoryId],
    references: [repositories.id],
  }),
  user: one(users, {
    fields: [commits.userId],
    references: [users.id],
  }),
}));

// Types
export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type Branch = typeof branches.$inferSelect;
export type Commit = typeof commits.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Release = typeof releases.$inferSelect;
