/**
 * Deploy Keys Schema - Drizzle ORM
 * Defines SSH deploy keys for repositories
 */

import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";

export const deployKeys = pgTable("deploy_keys", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    key: text("key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    readOnly: boolean("read_only").default(true).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
});

export const deployKeysRelations = relations(
    deployKeys,
    ({ one }) => ({
        repository: one(repositories, {
            fields: [deployKeys.repositoryId],
            references: [repositories.id],
        }),
    })
);

export type DeployKey = typeof deployKeys.$inferSelect;
export type NewDeployKey = typeof deployKeys.$inferInsert;
