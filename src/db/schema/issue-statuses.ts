import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { relations } from "drizzle-orm";

export const issueStatuses = pgTable("issue_statuses", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),

    // Status info
    name: text("name").notNull(), // e.g., "Backlog", "In Progress", "Done"
    color: text("color").notNull().default("#808080"),
    order: integer("order").notNull().default(0),

    // Type/Category
    type: text("type").notNull().default("open"), // open, complated, cancelled
    isDefault: integer("is_default").default(0), // 1 if default for new issues

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const issueStatusesRelations = relations(issueStatuses, ({ one }) => ({
    repository: one(repositories, {
        fields: [issueStatuses.repositoryId],
        references: [repositories.id],
    }),
}));
