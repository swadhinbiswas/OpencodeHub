/**
 * Custom Issue Fields Schema and Library
 * Define and use custom fields on issues
 */

import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import {
    customFieldDefinitions,
    issueCustomFieldValues,
    type CustomFieldDefinition,
    type IssueCustomFieldValue
} from "@/db/schema/custom-fields";

export type { CustomFieldDefinition, IssueCustomFieldValue };

/**
 * Create a custom field definition
 */
export async function createCustomField(options: {
    repositoryId: string;
    name: string;
    fieldType: "text" | "number" | "date" | "select" | "multiselect" | "checkbox";
    description?: string;
    isRequired?: boolean;
    options?: string[];
    defaultValue?: string;
}): Promise<CustomFieldDefinition> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const field = {
        id: crypto.randomUUID(),
        repositoryId: options.repositoryId,
        name: options.name,
        type: options.fieldType, // Schema uses 'type', input uses 'fieldType'
        description: options.description || null,
        required: options.isRequired || false, // Schema uses 'required'
        options: options.options || null, // Pass array directly for JSON column
        order: 0, // Schema uses 'order'
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // Insert without directive
    await db.insert(customFieldDefinitions).values(field);

    logger.info({ fieldId: field.id, name: options.name }, "Custom field created");

    return field as CustomFieldDefinition;
}

/**
 * Get all custom fields for a repository
 */
export async function getCustomFields(repositoryId: string): Promise<CustomFieldDefinition[]> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    try {
        return await db.query.customFieldDefinitions?.findMany({
            where: eq(customFieldDefinitions.repositoryId, repositoryId),
            orderBy: (fields: any, { asc }: any) => [asc(fields.order)],
        }) || [];
    } catch {
        return [];
    }
}

/**
 * Set custom field value on an issue
 */
export async function setFieldValue(options: {
    issueId: string;
    fieldId: string;
    value: string | number | boolean | string[];
}): Promise<IssueCustomFieldValue> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Convert value to string (values are still text type in schema)
    const valueStr = typeof options.value === "object"
        ? JSON.stringify(options.value)
        : String(options.value);

    // Check for existing value
    const existing = await db.query.issueCustomFieldValues?.findFirst({
        where: and(
            eq(issueCustomFieldValues.issueId, options.issueId),
            eq(issueCustomFieldValues.fieldId, options.fieldId)
        ),
    });

    if (existing) {
        // Insert without directive
        await db.update(issueCustomFieldValues)
            .set({ value: valueStr, updatedAt: new Date() })
            .where(eq(issueCustomFieldValues.id, existing.id));

        return { ...existing, value: valueStr, updatedAt: new Date() };
    }

    const fieldValue = {
        id: crypto.randomUUID(),
        issueId: options.issueId,
        fieldId: options.fieldId,
        value: valueStr,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // Insert without directive
    await db.insert(issueCustomFieldValues).values(fieldValue);

    return fieldValue as IssueCustomFieldValue;
}

/**
 * Get all custom field values for an issue
 */
export async function getIssueFieldValues(issueId: string): Promise<{
    field: CustomFieldDefinition;
    value: string | null;
}[]> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const issue = await db.query.issues.findFirst({
        where: eq(schema.issues.id, issueId),
    });

    if (!issue) return [];

    const fields = await getCustomFields(issue.repositoryId);
    const values = await db.query.issueCustomFieldValues?.findMany({
        where: eq(issueCustomFieldValues.issueId, issueId),
    }) || [];

    const valueMap = new Map(values.map((v: any) => [v.fieldId, v.value]));

    // Note: defaultValue logic might need revisit if defaultValue is also just a string
    return fields.map(field => ({
        field,
        value: (valueMap.get(field.id) as string | null) || null, // defaultValue is missing in schema? 
    }));
}

/**
 * Delete a custom field
 */
export async function deleteCustomField(fieldId: string): Promise<boolean> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    try {
        // Insert without directive
        await db.delete(customFieldDefinitions)
            .where(eq(customFieldDefinitions.id, fieldId));
        return true;
    } catch (error) {
        logger.error({ fieldId, error }, "Failed to delete custom field");
        return false;
    }
}

/**
 * Parse field value based on type
 */
export function parseFieldValue(
    value: string | null,
    fieldType: string
): string | number | boolean | string[] | null {
    if (value === null) return null;

    switch (fieldType) {
        case "number":
            return parseFloat(value);
        case "checkbox": // boolean called "boolean" in schema, but "checkbox" in code?
        case "boolean":
            return value === "true";
        case "multiselect":
            try {
                return JSON.parse(value);
            } catch {
                return [];
            }
        default:
            return value;
    }
}
