/**
 * Review Templates Schema and Library
 * Define reusable review templates for repositories
 */

import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";

/**
 * Review Templates table
 */
export const reviewTemplates = pgTable("review_templates", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    content: text("content").notNull(), // Markdown template
    isDefault: boolean("is_default").default(false),
    category: text("category"), // e.g., "bug_fix", "feature", "security"
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Note: Relations would go in schema file, for now keeping logic here

// Types
export type ReviewTemplate = typeof reviewTemplates.$inferSelect;

/**
 * Get all templates for a repository
 */
export async function getReviewTemplates(repositoryId: string): Promise<ReviewTemplate[]> {
    const db = getDatabase();

    // Check if table exists, otherwise return empty
    try {
        return await db.query.reviewTemplates?.findMany({
            where: eq(schema.reviewTemplates.repositoryId, repositoryId),
        }) || [];
    } catch {
        // Table may not exist yet
        return [];
    }
}

/**
 * Get default template for a repository
 */
export async function getDefaultTemplate(repositoryId: string): Promise<ReviewTemplate | null> {
    const templates = await getReviewTemplates(repositoryId);
    return templates.find(t => t.isDefault) || null;
}

/**
 * Create a new review template
 */
export async function createReviewTemplate(options: {
    repositoryId: string;
    name: string;
    content: string;
    description?: string;
    category?: string;
    isDefault?: boolean;
    createdById: string;
}): Promise<ReviewTemplate> {
    const db = getDatabase();

    const template = {
        id: crypto.randomUUID(),
        repositoryId: options.repositoryId,
        name: options.name,
        content: options.content,
        description: options.description || null,
        category: options.category || null,
        isDefault: options.isDefault || false,
        createdById: options.createdById,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.reviewTemplates).values(template);

    logger.info({ repositoryId: options.repositoryId, templateName: options.name }, "Review template created");

    return template as ReviewTemplate;
}

/**
 * Update a review template
 */
export async function updateReviewTemplate(
    templateId: string,
    updates: Partial<Pick<ReviewTemplate, "name" | "content" | "description" | "category" | "isDefault">>
): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.reviewTemplates)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .where(eq(schema.reviewTemplates.id, templateId));

        return true;
    } catch (error) {
        logger.error({ templateId, error }, "Failed to update review template");
        return false;
    }
}

/**
 * Delete a review template
 */
export async function deleteReviewTemplate(templateId: string): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.delete(schema.reviewTemplates)
            .where(eq(schema.reviewTemplates.id, templateId));

        return true;
    } catch (error) {
        logger.error({ templateId, error }, "Failed to delete review template");
        return false;
    }
}

/**
 * Default review templates
 */
export const DEFAULT_TEMPLATES = {
    general: {
        name: "General Review",
        content: `## Review Checklist

### Code Quality
- [ ] Code follows project style guidelines
- [ ] No unnecessary complexity
- [ ] Proper error handling
- [ ] No hardcoded values that should be configurable

### Testing
- [ ] Unit tests added/updated
- [ ] Integration tests if applicable
- [ ] Edge cases covered

### Documentation
- [ ] Code is self-documenting or has comments
- [ ] API documentation updated if needed
- [ ] README updated if needed

### Security
- [ ] No sensitive data exposed
- [ ] Input validation implemented
- [ ] SQL injection prevention

## Comments
<!-- Add your review comments here -->
`,
    },
    security: {
        name: "Security Review",
        content: `## Security Review Checklist

### Authentication & Authorization
- [ ] Proper authentication checks
- [ ] Authorization for all sensitive operations
- [ ] Session management is secure

### Data Protection
- [ ] Sensitive data is encrypted
- [ ] No PII in logs
- [ ] Proper data sanitization

### Input Validation
- [ ] All inputs validated
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection

### Dependencies
- [ ] No known vulnerabilities
- [ ] Dependencies are up to date

## Security Concerns
<!-- List any security concerns here -->
`,
    },
    bugFix: {
        name: "Bug Fix Review",
        content: `## Bug Fix Review

### Issue Reference
- Issue #:

### Root Cause
<!-- Describe the root cause of the bug -->

### Fix Verification
- [ ] Bug is reproducible before fix
- [ ] Bug is fixed after changes
- [ ] No regression introduced
- [ ] Edge cases handled

### Testing
- [ ] Test case added to prevent regression
- [ ] Existing tests pass

## Additional Comments
<!-- Any additional observations -->
`,
    },
};

/**
 * Initialize default templates for a repository
 */
export async function initializeDefaultTemplates(
    repositoryId: string,
    createdById: string
): Promise<void> {
    for (const [key, template] of Object.entries(DEFAULT_TEMPLATES)) {
        await createReviewTemplate({
            repositoryId,
            name: template.name,
            content: template.content,
            category: key,
            isDefault: key === "general",
            createdById,
        });
    }
}
