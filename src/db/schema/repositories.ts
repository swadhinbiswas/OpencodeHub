/**
 * Repository Schema - Drizzle ORM
 * Defines repositories, branches, commits, tags
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const repositories = pgTable("repositories", {
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
  website: text("website"),
  starCount: integer("star_count").default(0).notNull(),
  forkCount: integer("fork_count").default(0).notNull(),
  watchCount: integer("watch_count").default(0).notNull(),
  openIssueCount: integer("open_issue_count").default(0).notNull(),
  openPrCount: integer("open_pr_count").default(0).notNull(),
  size: integer("size").default(0).notNull(), // Size in KB
  isFork: boolean("is_fork").default(false),
  forkedFromId: text("forked_from_id").references((): any => repositories.id),
  isArchived: boolean("is_archived").default(false),
  isTemplate: boolean("is_template").default(false),
  isMirror: boolean("is_mirror").default(false),
  mirrorUrl: text("mirror_url"),
  lastMirrorSyncAt: timestamp("last_mirror_sync_at"),
  mirrorSyncStatus: text("mirror_sync_status"), // pending, syncing, success, failed
  hasIssues: boolean("has_issues").default(true),
  hasWiki: boolean("has_wiki").default(true),
  hasActions: boolean("has_actions").default(true),
  allowForking: boolean("allow_forking").default(true),
  licenseType: text("license_type"),
  topics: text("topics"), // JSON array
  language: text("language"), // Primary language
  languages: text("languages"), // JSON object { lang: percentage }
  lastActivityAt: timestamp("last_activity_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const branches = pgTable("branches", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  commitSha: text("commit_sha").notNull(),
  isProtected: boolean("is_protected").default(false),
  isDefault: boolean("is_default").default(false),
  protectionRules: text("protection_rules"), // JSON
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const commits = pgTable("commits", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  sha: text("sha").notNull(),
  message: text("message").notNull(),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email").notNull(),
  authorDate: timestamp("author_date").notNull(),
  committerName: text("committer_name").notNull(),
  committerEmail: text("committer_email").notNull(),
  committerDate: timestamp("committer_date").notNull(),
  parentShas: text("parent_shas"), // JSON array
  treesha: text("tree_sha"),
  userId: text("user_id").references(() => users.id),
  stats: text("stats"), // JSON { additions, deletions, files_changed }
  signature: text("signature"), // GPG signature
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tags = pgTable("tags", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  commitSha: text("commit_sha").notNull(),
  message: text("message"),
  taggerName: text("tagger_name"),
  taggerEmail: text("tagger_email"),
  taggedAt: timestamp("tagged_at"),
  isRelease: boolean("is_release").default(false),
  releaseId: text("release_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const releases = pgTable("releases", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  tagId: text("tag_id").references(() => tags.id),
  name: text("name").notNull(),
  body: text("body"),
  isDraft: boolean("is_draft").default(false),
  isPrerelease: boolean("is_prerelease").default(false),
  authorId: text("author_id").references(() => users.id),
  assets: text("assets"), // JSON array of asset metadata
  downloadCount: integer("download_count").default(0),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const repositoryStars = pgTable("repository_stars", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const repositoryWatchers = pgTable("repository_watchers", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  watchLevel: text("watch_level").notNull().default("watching"), // watching, releases_only, ignoring
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const repositoryCollaborators = pgTable("repository_collaborators", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("developer"), // owner, maintainer, developer, guest
  addedById: text("added_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
    // deployKeys relation moved to deploy-keys.ts
    // webhooks: many(webhooks), // Removing relation here to avoid circular dependency or import issues for now, or I need to import it.
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

export const repositoryCollaboratorsRelations = relations(repositoryCollaborators, ({ one }) => ({
  repository: one(repositories, {
    fields: [repositoryCollaborators.repositoryId],
    references: [repositories.id],
  }),
  user: one(users, {
    fields: [repositoryCollaborators.userId],
    references: [users.id],
  }),
  addedBy: one(users, {
    fields: [repositoryCollaborators.addedById],
    references: [users.id],
  }),
}));

export const repositoryStarsRelations = relations(repositoryStars, ({ one }) => ({
  repository: one(repositories, {
    fields: [repositoryStars.repositoryId],
    references: [repositories.id],
  }),
  user: one(users, {
    fields: [repositoryStars.userId],
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
