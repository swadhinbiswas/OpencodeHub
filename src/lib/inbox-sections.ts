/**
 * Inbox Sections Library
 * Custom inbox sections with user-defined filters (Graphite-style)
 */

import { eq, and, asc, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { generateId } from "./utils";
import type { InboxSectionFilters } from "@/db/schema/inbox-sections";

/**
 * Get all inbox sections for a user
 */
export async function getUserInboxSections(userId: string) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const sections = await db.query.inboxSections.findMany({
        where: eq(schema.inboxSections.userId, userId),
        orderBy: [asc(schema.inboxSections.position)],
    });

    return sections.map(s => ({
        ...s,
        filters: s.filters ? JSON.parse(s.filters) as InboxSectionFilters : null,
    }));
}

/**
 * Get or create default sections for a user
 */
export async function getOrCreateDefaultSections(userId: string) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const existing = await db.query.inboxSections.findMany({
        where: eq(schema.inboxSections.userId, userId),
    });

    if (existing.length > 0) {
        return existing;
    }

    // Create default sections
    const defaults = [
        {
            id: generateId(),
            userId,
            name: "Needs Your Review",
            icon: "eye",
            color: "#f59e0b",
            filters: JSON.stringify({ isReviewRequested: true, state: "open" }),
            position: 0,
            isDefault: true,
        },
        {
            id: generateId(),
            userId,
            name: "Waiting on Others",
            icon: "clock",
            color: "#3b82f6",
            filters: JSON.stringify({ isAssignedToMe: false, state: "open" }),
            position: 1,
            isDefault: true,
        },
        {
            id: generateId(),
            userId,
            name: "Ready to Merge",
            icon: "check-circle",
            color: "#22c55e",
            filters: JSON.stringify({ ciStatus: "success", hasMyReview: true }),
            position: 2,
            isDefault: true,
        },
    ];

    await db.insert(schema.inboxSections).values(defaults);

    return defaults;
}

/**
 * Create a custom inbox section
 */
export async function createInboxSection(options: {
    userId: string;
    name: string;
    icon?: string;
    color?: string;
    filters?: InboxSectionFilters;
}) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get current max position
    const existing = await db.query.inboxSections.findMany({
        where: eq(schema.inboxSections.userId, options.userId),
    });
    const maxPosition = Math.max(...existing.map(s => s.position), -1);

    const section = {
        id: generateId(),
        userId: options.userId,
        name: options.name,
        icon: options.icon,
        color: options.color,
        filters: options.filters ? JSON.stringify(options.filters) : null,
        position: maxPosition + 1,
        isDefault: false,
    };

    await db.insert(schema.inboxSections).values(section);

    return section;
}

/**
 * Update an inbox section
 */
export async function updateInboxSection(
    sectionId: string,
    userId: string,
    updates: {
        name?: string;
        icon?: string;
        color?: string;
        filters?: InboxSectionFilters;
        isCollapsed?: boolean;
        showCount?: boolean;
    }
) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.icon !== undefined) updateData.icon = updates.icon;
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.filters !== undefined) updateData.filters = JSON.stringify(updates.filters);
    if (updates.isCollapsed !== undefined) updateData.isCollapsed = updates.isCollapsed;
    if (updates.showCount !== undefined) updateData.showCount = updates.showCount;

    await db
        .update(schema.inboxSections)
        .set(updateData)
        .where(and(
            eq(schema.inboxSections.id, sectionId),
            eq(schema.inboxSections.userId, userId)
        ));
}

/**
 * Delete an inbox section
 */
export async function deleteInboxSection(sectionId: string, userId: string) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    await db
        .delete(schema.inboxSections)
        .where(and(
            eq(schema.inboxSections.id, sectionId),
            eq(schema.inboxSections.userId, userId)
        ));
}

/**
 * Reorder inbox sections
 */
export async function reorderInboxSections(
    userId: string,
    sectionIds: string[]
) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    for (let i = 0; i < sectionIds.length; i++) {
        await db
            .update(schema.inboxSections)
            .set({ position: i })
            .where(and(
                eq(schema.inboxSections.id, sectionIds[i]),
                eq(schema.inboxSections.userId, userId)
            ));
    }
}

/**
 * Get PRs matching section filters
 */
export async function getPRsForSection(
    userId: string,
    filters: InboxSectionFilters,
    limit: number = 50
) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Build query conditions based on filters
    let prs = await db.query.pullRequests.findMany({
        where: eq(schema.pullRequests.state, filters.state || "open"),
        orderBy: [desc(schema.pullRequests.updatedAt)],
        limit,
        with: {
            repository: true,
            author: true,
        },
    });

    // Apply additional filters
    if (filters.author?.length) {
        prs = prs.filter(pr =>
            pr.author && filters.author!.includes(pr.author.username)
        );
    }

    if (filters.repository?.length) {
        prs = prs.filter(pr =>
            pr.repository && filters.repository!.includes(pr.repository.name)
        );
    }
    if (filters.isReviewRequested) {
        // Filter to PRs where user is a requested reviewer
        const reviewerRequests = await db.query.pullRequestReviewers.findMany({
            where: eq(schema.pullRequestReviewers.userId, userId),
        });
        const reviewPrIds = new Set(reviewerRequests.map(r => r.pullRequestId));
        prs = prs.filter(pr => reviewPrIds.has(pr.id));
    }

    if (filters.updatedWithin) {
        const now = Date.now();
        const durations: Record<string, number> = {
            "1h": 60 * 60 * 1000,
            "1d": 24 * 60 * 60 * 1000,
            "1w": 7 * 24 * 60 * 60 * 1000,
            "1m": 30 * 24 * 60 * 60 * 1000,
        };
        const duration = durations[filters.updatedWithin];
        if (duration) {
            prs = prs.filter(pr =>
                now - new Date(pr.updatedAt).getTime() <= duration
            );
        }
    }

    if (filters.excludeAuthors?.length) {
        prs = prs.filter(pr =>
            !pr.author || !filters.excludeAuthors!.includes(pr.author.username)
        );
    }

    return prs;
}

/**
 * Share an inbox section with a user or team
 */
export async function shareInboxSection(
    sectionId: string,
    shareWithUserId?: string,
    shareWithTeamId?: string,
    permission: "view" | "edit" = "view"
) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const share = {
        id: generateId(),
        sectionId,
        sharedWithUserId: shareWithUserId,
        sharedWithTeamId: shareWithTeamId,
        permission,
    };

    await db.insert(schema.sharedInboxSections).values(share);

    return share;
}
