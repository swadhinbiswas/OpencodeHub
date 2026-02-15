
import { relations } from "drizzle-orm";
import { boolean, integer, json, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { issues } from "./issues";

export const customFieldDefinitions = pgTable("custom_field_definitions", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull(), // text, number, date, select, multiselect, user, boolean
    options: json("options").$type<string[]>(), // Array of strings for select/multiselect
    required: boolean("required").default(false),
    order: integer("order").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const issueCustomFieldValues = pgTable("issue_custom_field_values", {
    id: text("id").primaryKey(),
    issueId: text("issue_id")
        .notNull()
        .references(() => issues.id, { onDelete: "cascade" }),
    fieldId: text("field_id")
        .notNull()
        .references(() => customFieldDefinitions.id, { onDelete: "cascade" }),
    value: text("value"), // Stored as string, parsed based on type
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Relations
export const customFieldDefinitionsRelations = relations(customFieldDefinitions, ({ one, many }) => ({
    repository: one(repositories, {
        fields: [customFieldDefinitions.repositoryId],
        references: [repositories.id],
    }),
    values: many(issueCustomFieldValues),
}));

export const issueCustomFieldValuesRelations = relations(issueCustomFieldValues, ({ one }) => ({
    issue: one(issues, {
        fields: [issueCustomFieldValues.issueId],
        references: [issues.id],
    }),
    field: one(customFieldDefinitions, {
        fields: [issueCustomFieldValues.fieldId],
        references: [customFieldDefinitions.id],
    }),
}));

export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type IssueCustomFieldValue = typeof issueCustomFieldValues.$inferSelect;
