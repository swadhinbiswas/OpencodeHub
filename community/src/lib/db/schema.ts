import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const communityUsers = sqliteTable("community_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const instances = sqliteTable("instances", {
  id: text("id").primaryKey(),
  url: text("url").notNull().unique(),
  siteUrl: text("site_url").notNull(),
  name: text("name").notNull(),
  version: text("version"),
  capabilities: text("capabilities"),
  status: text("status").default("pending"),
  lastSyncAt: text("last_sync_at"),
  repoCount: integer("repo_count").default(0),
  userCount: integer("user_count").default(0),
  submittedBy: text("submitted_by"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("instances_url_idx").on(t.url)]);

export const cachedRepos = sqliteTable("cached_repos", {
  id: text("id").primaryKey(),
  instanceId: text("instance_id").notNull().references(() => instances.id, { onDelete: "cascade" }),
  remoteId: text("remote_id").notNull(),
  fullName: text("full_name").notNull(),
  name: text("name").notNull(),
  ownerUsername: text("owner_username").notNull(),
  ownerDisplayName: text("owner_display_name"),
  ownerAvatarUrl: text("owner_avatar_url"),
  description: text("description"),
  visibility: text("visibility").default("public"),
  language: text("language"),
  topics: text("topics"),
  starCount: integer("star_count").default(0),
  forkCount: integer("fork_count").default(0),
  watchCount: integer("watch_count").default(0),
  httpCloneUrl: text("http_clone_url"),
  updatedAt: text("updated_at"),
  cachedAt: text("cached_at").default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("cached_repos_instance_idx").on(t.instanceId),
  index("cached_repos_fullname_idx").on(t.fullName),
]);

export const cachedUsers = sqliteTable("cached_users", {
  id: text("id").primaryKey(),
  instanceId: text("instance_id").notNull().references(() => instances.id, { onDelete: "cascade" }),
  remoteId: text("remote_id").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  location: text("location"),
  website: text("website"),
  company: text("company"),
  repoCount: integer("repo_count").default(0),
  followerCount: integer("follower_count").default(0),
  cachedAt: text("cached_at").default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("cached_users_instance_idx").on(t.instanceId)]);

export const stars = sqliteTable("stars", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => communityUsers.id, { onDelete: "cascade" }),
  repoId: text("repo_id").notNull().references(() => cachedRepos.id, { onDelete: "cascade" }),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("stars_user_repo_idx").on(t.userId, t.repoId)]);

export const follows = sqliteTable("follows", {
  id: text("id").primaryKey(),
  followerId: text("follower_id").notNull().references(() => communityUsers.id, { onDelete: "cascade" }),
  followeeType: text("followee_type").notNull(),
  followeeId: text("followee_id").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
