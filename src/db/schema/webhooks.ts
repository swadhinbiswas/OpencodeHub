/**
 * Webhooks Schema - Drizzle ORM
 * Defines webhooks and delivery logs
 */

import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { repositories } from "./repositories";
import { users } from "./users";

export const webhooks = sqliteTable("webhooks", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret"), // Encrypted or plain? For now plain/masked in UI
    events: text("events", { mode: "json" }).notNull(), // JSON array of events ['push', 'pull_request']
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    contentType: text("content_type").notNull().default("json"), // json | form

    // Stats
    deliveryCount: integer("delivery_count").default(0),
    lastDeliveryStatus: text("last_delivery_status"), // success | failure
    lastDeliveryAt: text("last_delivery_at"),

    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
    createdById: text("created_by_id").references(() => users.id),
});

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
        .notNull()
        .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),

    status: text("status").notNull(), // success | failure
    responseCode: integer("response_code"),
    responseBody: text("response_body"),
    durationMs: integer("duration_ms"),

    error: text("error"),
    requestHeaders: text("request_headers", { mode: "json" }),
    responseHeaders: text("response_headers", { mode: "json" }),

    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
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
