/**
 * Issue Workflows Library
 * Define and manage issue state workflows
 */

import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";

/**
 * Workflow state definitions
 */
export const workflowStates = pgTable("workflow_states", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(), // todo, in_progress, done
    color: text("color").default("#6b7280"),
    icon: text("icon"),
    displayOrder: integer("display_order").default(0),
    isDefault: boolean("is_default").default(false),
    isClosedState: boolean("is_closed_state").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Allowed transitions between states
 */
export const workflowTransitions = pgTable("workflow_transitions", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    fromStateId: text("from_state_id")
        .references(() => workflowStates.id, { onDelete: "cascade" }),
    toStateId: text("to_state_id")
        .notNull()
        .references(() => workflowStates.id, { onDelete: "cascade" }),
    requiresComment: boolean("requires_comment").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WorkflowState = typeof workflowStates.$inferSelect;
export type WorkflowTransition = typeof workflowTransitions.$inferSelect;

/**
 * Default workflow states
 */
const DEFAULT_WORKFLOW = [
    { name: "Backlog", category: "todo", color: "#6b7280", order: 0 },
    { name: "Todo", category: "todo", color: "#3b82f6", order: 1, isDefault: true },
    { name: "In Progress", category: "in_progress", color: "#f59e0b", order: 2 },
    { name: "In Review", category: "in_progress", color: "#8b5cf6", order: 3 },
    { name: "Done", category: "done", color: "#22c55e", order: 4, isClosedState: true },
    { name: "Cancelled", category: "done", color: "#ef4444", order: 5, isClosedState: true },
];

/**
 * Initialize default workflow for a repository
 */
export async function initializeDefaultWorkflow(repositoryId: string): Promise<void> {
    const db = getDatabase();

    for (const state of DEFAULT_WORKFLOW) {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.workflowStates).values({
            id: crypto.randomUUID(),
            repositoryId,
            name: state.name,
            category: state.category,
            color: state.color,
            displayOrder: state.order,
            isDefault: state.isDefault || false,
            isClosedState: state.isClosedState || false,
            createdAt: new Date(),
        });
    }

    logger.info({ repositoryId }, "Default workflow initialized");
}

/**
 * Get workflow states for a repository
 */
export async function getWorkflowStates(repositoryId: string): Promise<WorkflowState[]> {
    const db = getDatabase();

    try {
        return await db.query.workflowStates?.findMany({
            where: eq(schema.workflowStates.repositoryId, repositoryId),
            orderBy: (states, { asc }) => [asc(states.displayOrder)],
        }) || [];
    } catch {
        return [];
    }
}

/**
 * Get allowed transitions from a state
 */
export async function getAllowedTransitions(
    repositoryId: string,
    fromStateId: string | null
): Promise<WorkflowState[]> {
    const db = getDatabase();

    try {
        const transitions = await db.query.workflowTransitions?.findMany({
            where: and(
                eq(schema.workflowTransitions.repositoryId, repositoryId),
                fromStateId
                    ? eq(schema.workflowTransitions.fromStateId, fromStateId)
                    : undefined
            ),
        }) || [];

        const toStateIds = transitions.map(t => t.toStateId);

        if (toStateIds.length === 0) {
            // If no transitions defined, allow all transitions
            return getWorkflowStates(repositoryId);
        }

        return await db.query.workflowStates?.findMany({
            where: and(
                eq(schema.workflowStates.repositoryId, repositoryId),
            ),
        }).then(states => states.filter(s => toStateIds.includes(s.id))) || [];
    } catch {
        return getWorkflowStates(repositoryId);
    }
}

/**
 * Transition issue to new state
 */
export async function transitionIssue(options: {
    issueId: string;
    toStateId: string;
    userId: string;
    comment?: string;
}): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase();

    const issue = await db.query.issues.findFirst({
        where: eq(schema.issues.id, options.issueId),
    });

    if (!issue) {
        return { success: false, error: "Issue not found" };
    }

    const toState = await db.query.workflowStates?.findFirst({
        where: eq(schema.workflowStates.id, options.toStateId),
    });

    if (!toState) {
        return { success: false, error: "Target state not found" };
    }

    // Update issue state
    const newState = toState.isClosedState ? "closed" : "open";

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.update(schema.issues)
        .set({
            state: newState,
            closedAt: toState.isClosedState ? new Date() : null,
            closedById: toState.isClosedState ? options.userId : null,
            updatedAt: new Date(),
        })
        .where(eq(schema.issues.id, options.issueId));

    // Add comment if provided
    if (options.comment) {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.issueComments).values({
            id: crypto.randomUUID(),
            issueId: options.issueId,
            authorId: options.userId,
            body: `**State changed to ${toState.name}**\n\n${options.comment}`,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    logger.info({ issueId: options.issueId, newState: toState.name }, "Issue transitioned");

    return { success: true };
}

/**
 * Create a custom workflow state
 */
export async function createWorkflowState(options: {
    repositoryId: string;
    name: string;
    category: "todo" | "in_progress" | "done";
    color?: string;
    isClosedState?: boolean;
}): Promise<WorkflowState> {
    const db = getDatabase();

    const existingStates = await getWorkflowStates(options.repositoryId);
    const maxOrder = Math.max(0, ...existingStates.map(s => s.displayOrder || 0));

    const state = {
        id: crypto.randomUUID(),
        repositoryId: options.repositoryId,
        name: options.name,
        category: options.category,
        color: options.color || "#6b7280",
        displayOrder: maxOrder + 1,
        isDefault: false,
        isClosedState: options.isClosedState || false,
        createdAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.workflowStates).values(state);

    return state as WorkflowState;
}
