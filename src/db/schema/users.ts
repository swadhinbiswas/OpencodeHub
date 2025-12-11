/**
 * User Schema - Drizzle ORM
 * Defines users, sessions, SSH keys, and OAuth accounts
 */

import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  location: text("location"),
  website: text("website"),
  company: text("company"),
  isAdmin: integer("is_admin", { mode: "boolean" }).default(false),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false),
  twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).default(
    false
  ),
  twoFactorSecret: text("two_factor_secret"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const sshKeys = sqliteTable("ssh_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  fingerprint: text("fingerprint").notNull().unique(),
  publicKey: text("public_key").notNull(),
  keyType: text("key_type").notNull(), // ssh-rsa, ssh-ed25519, etc.
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const oauthAccounts = sqliteTable("oauth_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // github, google, gitlab
  providerAccountId: text("provider_account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const emailVerificationTokens = sqliteTable(
  "email_verification_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  }
);

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  sshKeys: many(sshKeys),
  oauthAccounts: many(oauthAccounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const sshKeysRelations = relations(sshKeys, ({ one }) => ({
  user: one(users, {
    fields: [sshKeys.userId],
    references: [users.id],
  }),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SSHKey = typeof sshKeys.$inferSelect;
export type NewSSHKey = typeof sshKeys.$inferInsert;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
