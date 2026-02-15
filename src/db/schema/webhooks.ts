/**
 * Webhooks Schema - Drizzle ORM
 * Defines webhooks and delivery logs
 */

import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const webhooks = pgTable("webhooks", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),

    // Provider and configuration
    provider: text("provider").default("generic"), // teams, discord, slack, generic
    name: text("name"), // Display name for the webhook
    url: text("url").notNull(),
    secret: text("secret"), // Encrypted or plain? For now plain/masked in UI
    events: text("events").notNull(), // JSON array of events ['push', 'pull_request']
    active: boolean("active").notNull().default(true),
    enabled: boolean("enabled").notNull().default(true), // Alias for active
    contentType: text("content_type").notNull().default("json"), // json | form

    // Stats
    deliveryCount: integer("delivery_count").default(0),
    lastDeliveryStatus: text("last_delivery_status"), // success | failure
    lastDeliveryAt: timestamp("last_delivery_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdById: text("created_by_id").references(() => users.id),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
        .notNull()
        .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: text("payload").notNull(), // JSON

    status: text("status").notNull(), // success | failure
    responseCode: integer("response_code"),
    responseBody: text("response_body"),
    durationMs: integer("duration_ms"),

    error: text("error"),
    requestHeaders: text("request_headers"), // JSON
    responseHeaders: text("response_headers"), // JSON

    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
    repository: one(repositories, {
        fields: [webhooks.repositoryId],
        references: [repositories.id],
    }),
    createdBy: one(users, {
        fields: [webhooks.createdById],
        references: [users.id],
    }),
    deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(
    webhookDeliveries,
    ({ one }) => ({
        webhook: one(webhooks, {
            fields: [webhookDeliveries.webhookId],
            references: [webhooks.id],
        }),
    })
);
