
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";

export const pipelineRunners = pgTable("pipeline_runners", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id").references(() => repositories.id, { onDelete: "cascade" }), // If null, global runner (future)
    token: text("token").notNull(), // Authentication token (hashed or raw? raw for MVP simplicity, highly secured in real)
    name: text("name").notNull(),
    os: text("os"),
    arch: text("arch"),
    version: text("version"),
    status: text("status").notNull().default("offline"), // online, offline, busy
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pipelineRunnersRelations = relations(pipelineRunners, ({ one }) => ({
    repository: one(repositories, {
        fields: [pipelineRunners.repositoryId],
        references: [repositories.id],
    }),
}));

export type PipelineRunner = typeof pipelineRunners.$inferSelect;
export type NewPipelineRunner = typeof pipelineRunners.$inferInsert;
