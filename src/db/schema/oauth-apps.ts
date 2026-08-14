import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * OAuth provider mode (WS4-02): third-party apps can register and OAuth
 * into OpenCodeHub (authorization-code flow), enabling the GitHub/Gitea
 * integration surface.
 */
export const oauthApps = pgTable(
  "oauth_apps",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    clientId: text("client_id").notNull().unique(),
    clientSecretHash: text("client_secret_hash").notNull(),
    redirectUris: text("redirect_uris").notNull(), // JSON array
    scopes: text("scopes"), // JSON array of granted scopes
    homepageUrl: text("homepage_url"),
    iconUrl: text("icon_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("oauth_apps_owner_idx").on(t.ownerId),
  }),
);

export const oauthAuthorizationCodes = pgTable(
  "oauth_authorization_codes",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => oauthApps.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    redirectUri: text("redirect_uri").notNull(),
    scopes: text("scopes").notNull(), // JSON
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    usedAt: timestamp("used_at"),
  },
  (t) => ({
    appIdx: index("oauth_codes_app_idx").on(t.appId),
  }),
);
