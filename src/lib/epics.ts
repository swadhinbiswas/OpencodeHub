/**
 * Epics and Sub-tasks Library
 * Manage hierarchical issue structures
 */

import { getDatabase, schema } from "@/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { logger } from "./logger";

export interface EpicInfo {
    epic: typeof schema.issues.$inferSelect;
    children: typeof schema.issues.$inferSelect[];
    progress: {
        total: number;
        closed: number;
        percentage: number;
    };
}

/**
 * Create an epic
 */
export async function createEpic(options: {
    repositoryId: string;
    title: string;
    body?: string;
    authorId: string;
}): Promise<typeof schema.issues.$inferSelect> {
    const db = getDatabase();

    // Get next issue number
    const lastIssue = await db.query.issues.findFirst({
        where: eq(schema.issues.repositoryId, options.repositoryId),
        orderBy: (issues, { desc }) => [desc(issues.number)],
    });

    const number = (lastIssue?.number || 0) + 1;

    const epic = {
        id: crypto.randomUUID(),
        repositoryId: options.repositoryId,
        number,
        title: options.title,
        body: options.body || null,
        type: "epic",
        state: "open",
        authorId: options.authorId,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.issues).values(epic);

    logger.info({ epicId: epic.id, number }, "Epic created");

    return epic as typeof schema.issues.$inferSelect;
}

/**
 * Create a sub-task under an epic or issue
 */
export async function createSubTask(options: {
    parentId: string;
    title: string;
    body?: string;
    authorId: string;
}): Promise<typeof schema.issues.$inferSelect> {
    const db = getDatabase();

    const parent = await db.query.issues.findFirst({
        where: eq(schema.issues.id, options.parentId),
    });

    if (!parent) {
        throw new Error("Parent issue not found");
    }

    // Get next issue number for this repo
    const lastIssue = await db.query.issues.findFirst({
        where: eq(schema.issues.repositoryId, parent.repositoryId),
        orderBy: (issues, { desc }) => [desc(issues.number)],
    });

    const number = (lastIssue?.number || 0) + 1;

    const task = {
        id: crypto.randomUUID(),
        repositoryId: parent.repositoryId,
        number,
        title: options.title,
        body: options.body || null,
        type: "task",
        parentId: options.parentId,
        state: "open",
        authorId: options.authorId,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.issues).values(task);

    logger.info({ taskId: task.id, parentId: options.parentId }, "Sub-task created");

    return task as typeof schema.issues.$inferSelect;
}

/**
 * Get epic with all children and progress
 */
export async function getEpicInfo(epicId: string): Promise<EpicInfo | null> {
    const db = getDatabase();

    const epic = await db.query.issues.findFirst({
        where: and(
            eq(schema.issues.id, epicId),
            eq(schema.issues.type, "epic")
        ),
    });

    if (!epic) return null;

    const children = await db.query.issues.findMany({
        where: eq(schema.issues.parentId, epicId),
    });

    const closed = children.filter(c => c.state === "closed").length;
    const total = children.length;

    return {
        epic,
        children,
        progress: {
            total,
            closed,
            percentage: total > 0 ? Math.round((closed / total) * 100) : 0,
        },
    };
}

/**
 * Get all epics for a repository
 */
export async function getRepositoryEpics(repositoryId: string): Promise<EpicInfo[]> {
    const db = getDatabase();

    const epics = await db.query.issues.findMany({
        where: and(
            eq(schema.issues.repositoryId, repositoryId),
            eq(schema.issues.type, "epic")
        ),
    });

    const epicInfos: EpicInfo[] = [];

    for (const epic of epics) {
        const info = await getEpicInfo(epic.id);
        if (info) epicInfos.push(info);
    }

    return epicInfos;
}

/**
 * Move issue to an epic
 */
export async function addToEpic(issueId: string, epicId: string): Promise<boolean> {
    const db = getDatabase();

    const epic = await db.query.issues.findFirst({
        where: and(
            eq(schema.issues.id, epicId),
            eq(schema.issues.type, "epic")
        ),
    });

    if (!epic) return false;

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.update(schema.issues)
        .set({ parentId: epicId, updatedAt: new Date() })
        .where(eq(schema.issues.id, issueId));

    return true;
}

/**
 * Remove issue from epic
 */
export async function removeFromEpic(issueId: string): Promise<boolean> {
    const db = getDatabase();

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.update(schema.issues)
        .set({ parentId: null, updatedAt: new Date() })
        .where(eq(schema.issues.id, issueId));

    return true;
}

/**
 * Get issue hierarchy (breadcrumb)
 */
export async function getIssueHierarchy(issueId: string): Promise<typeof schema.issues.$inferSelect[]> {
    const db = getDatabase();
    const hierarchy: typeof schema.issues.$inferSelect[] = [];

    let currentId: string | null = issueId;

    while (currentId) {
        const issue = await db.query.issues.findFirst({
            where: eq(schema.issues.id, currentId),
        }) as typeof schema.issues.$inferSelect | undefined;

        if (!issue) break;

        hierarchy.unshift(issue);
        currentId = issue.parentId;
    }

    return hierarchy;
}

/**
 * Convert issue to epic
 */
export async function convertToEpic(issueId: string): Promise<boolean> {
    const db = getDatabase();

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.update(schema.issues)
        .set({ type: "epic", parentId: null, updatedAt: new Date() })
        .where(eq(schema.issues.id, issueId));

    return true;
}

/**
 * Convert issue to task
 */
export async function convertToTask(issueId: string, parentId?: string): Promise<boolean> {
    const db = getDatabase();

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.update(schema.issues)
        .set({
            type: "task",
            parentId: parentId || null,
            updatedAt: new Date()
        })
        .where(eq(schema.issues.id, issueId));

    return true;
}
