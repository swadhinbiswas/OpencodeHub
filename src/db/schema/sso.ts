/**
 * SSO Configuration Schema
 * Stores OIDC provider configurations for SSO
 */

import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const ssoConfigs = pgTable("sso_configs", {
    id: text("id").primaryKey(),

    // Basic info
    name: text("name").notNull(), // Display name
    type: text("type").notNull().default("oidc"), // oidc, saml (future)

    // OIDC Configuration
    issuer: text("issuer").notNull(), // OIDC issuer URL
    clientId: text("client_id").notNull(),
    clientSecret: text("client_secret").notNull(), // Encrypted at rest
    scopes: text("scopes").default("openid,profile,email"),

    // Optional overrides for non-standard providers
    authorizationUrl: text("authorization_url"),
    tokenUrl: text("token_url"),
    userInfoUrl: text("userinfo_url"),
    jwksUri: text("jwks_uri"),

    // Behavior settings
    enabled: boolean("enabled").default(false),
    autoCreateUsers: boolean("auto_create_users").default(true),
    allowedDomains: text("allowed_domains"), // Comma-separated
    defaultRole: text("default_role").default("member"),

    // Organization scope (null = global)
    organizationId: text("organization_id")
        .references(() => organizations.id, { onDelete: "cascade" }),

    // Audit
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdById: text("created_by_id"),
});

export const ssoConfigsRelations = relations(ssoConfigs, ({ one }) => ({
    organization: one(organizations, {
        fields: [ssoConfigs.organizationId],
        references: [organizations.id],
    }),
}));

export type SSOConfig = typeof ssoConfigs.$inferSelect;
export type NewSSOConfig = typeof ssoConfigs.$inferInsert;
