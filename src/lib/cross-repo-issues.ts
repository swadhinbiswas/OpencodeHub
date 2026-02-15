/**
 * Cross-repo Issues Library
 * Track and manage issues across repositories
 */

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and, or, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { issues } from "@/db/schema/issues";

/**
 * Cross-repo issue references
 */
export const crossRepoIssueLinks = pgTable("cross_repo_issue_links", {
    id: text("id").primaryKey(),
    sourceIssueId: text("source_issue_id")
        .notNull()
        .references(() => issues.id, { onDelete: "cascade" }),
    targetIssueId: text("target_issue_id")
        .notNull()
        .references(() => issues.id, { onDelete: "cascade" }),
    linkType: text("link_type").notNull(), // relates, blocks, blocked_by, duplicates
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CrossRepoIssueLink = typeof crossRepoIssueLinks.$inferSelect;

/**
 * Parse cross-repo issue references
 * Format: owner/repo#number
 */
export function parseCrossRepoReferences(text: string): {
    owner: string;
    repo: string;
    number: number;
}[] {
    const references: { owner: string; repo: string; number: number }[] = [];

    // Pattern: owner/repo#number
    const regex = /([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)#(\d+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        references.push({
            owner: match[1],
            repo: match[2],
            number: parseInt(match[3]),
        });
    }

    return references;
}

/**
 * Link issues across repos
 */
export async function linkCrossRepoIssues(options: {
    sourceIssueId: string;
    targetIssueId: string;
    linkType: "relates" | "blocks" | "blocked_by" | "duplicates";
    createdById: string;
}): Promise<CrossRepoIssueLink> {
    const db = getDatabase();

    // Check for existing link
    const existing = await db.query.crossRepoIssueLinks?.findFirst({
        where: and(
            eq(schema.crossRepoIssueLinks.sourceIssueId, options.sourceIssueId),
            eq(schema.crossRepoIssueLinks.targetIssueId, options.targetIssueId)
        ),
    });

    if (existing) {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.crossRepoIssueLinks)
            .set({ linkType: options.linkType })
            .where(eq(schema.crossRepoIssueLinks.id, existing.id));

        return { ...existing, linkType: options.linkType };
    }

    const link = {
        id: crypto.randomUUID(),
        sourceIssueId: options.sourceIssueId,
        targetIssueId: options.targetIssueId,
        linkType: options.linkType,
        createdById: options.createdById,
        createdAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.crossRepoIssueLinks).values(link);

    // Create reverse link for bidirectional types
    if (options.linkType === "relates") {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.crossRepoIssueLinks).values({
            id: crypto.randomUUID(),
            sourceIssueId: options.targetIssueId,
            targetIssueId: options.sourceIssueId,
            linkType: "relates",
            createdById: options.createdById,
            createdAt: new Date(),
        });
    } else if (options.linkType === "blocks") {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.crossRepoIssueLinks).values({
            id: crypto.randomUUID(),
            sourceIssueId: options.targetIssueId,
            targetIssueId: options.sourceIssueId,
            linkType: "blocked_by",
            createdById: options.createdById,
            createdAt: new Date(),
        });
    }

    logger.info({
        sourceId: options.sourceIssueId,
        targetId: options.targetIssueId,
        type: options.linkType
    }, "Cross-repo issues linked");

    return link as CrossRepoIssueLink;
}

/**
 * Get all linked issues for an issue
 */
export async function getLinkedCrossRepoIssues(issueId: string): Promise<{
    link: CrossRepoIssueLink;
    issue: typeof schema.issues.$inferSelect;
    repository: typeof schema.repositories.$inferSelect;
}[]> {
    const db = getDatabase();

    try {
        const links = await db.query.crossRepoIssueLinks?.findMany({
            where: or(
                eq(schema.crossRepoIssueLinks.sourceIssueId, issueId),
                eq(schema.crossRepoIssueLinks.targetIssueId, issueId)
            ),
        }) || [];

        const results = [];

        for (const link of links) {
            const targetId = link.sourceIssueId === issueId
                ? link.targetIssueId
                : link.sourceIssueId;

            const issue = await db.query.issues.findFirst({
                where: eq(schema.issues.id, targetId),
            });

            if (!issue) continue;

            const repository = await db.query.repositories.findFirst({
                where: eq(schema.repositories.id, issue.repositoryId),
            });

            if (repository) {
                results.push({ link, issue, repository });
            }
        }

        return results;
    } catch {
        return [];
    }
}

/**
 * Auto-link cross-repo issues from text
 */
export async function autoLinkCrossRepoIssues(
    issueId: string,
    text: string,
    createdById: string
): Promise<CrossRepoIssueLink[]> {
    const db = getDatabase();
    const references = parseCrossRepoReferences(text);
    const links: CrossRepoIssueLink[] = [];

    for (const ref of references) {
        // Find repository
        const ownerUser = await db.query.users.findFirst({
            where: eq(schema.users.username, ref.owner),
        });

        if (!ownerUser) continue;

        const repo = await db.query.repositories.findFirst({
            where: and(
                eq(schema.repositories.ownerId, ownerUser.id),
                eq(schema.repositories.name, ref.repo)
            ),
        });

        if (!repo) continue;

        // Find issue
        const targetIssue = await db.query.issues.findFirst({
            where: and(
                eq(schema.issues.repositoryId, repo.id),
                eq(schema.issues.number, ref.number)
            ),
        });

        if (!targetIssue) continue;

        const link = await linkCrossRepoIssues({
            sourceIssueId: issueId,
            targetIssueId: targetIssue.id,
            linkType: "relates",
            createdById,
        });

        links.push(link);
    }

    return links;
}

/**
 * Get blocking issues (issues that block this one)
 */
export async function getBlockingIssues(issueId: string): Promise<typeof schema.issues.$inferSelect[]> {
    const db = getDatabase();

    try {
        const links = await db.query.crossRepoIssueLinks?.findMany({
            where: and(
                eq(schema.crossRepoIssueLinks.sourceIssueId, issueId),
                eq(schema.crossRepoIssueLinks.linkType, "blocked_by")
            ),
        }) || [];

        const issues = [];

        for (const link of links) {
            const issue = await db.query.issues.findFirst({
                where: eq(schema.issues.id, link.targetIssueId),
            });
            if (issue) issues.push(issue);
        }

        return issues;
    } catch {
        return [];
    }
}

/**
 * Check if issue is blocked
 */
export async function isIssueBlocked(issueId: string): Promise<boolean> {
    const blockers = await getBlockingIssues(issueId);
    return blockers.some(b => b.state === "open");
}

/**
 * Unlink cross-repo issues
 */
export async function unlinkCrossRepoIssues(linkId: string): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.delete(schema.crossRepoIssueLinks)
            .where(eq(schema.crossRepoIssueLinks.id, linkId));
        return true;
    } catch {
        return false;
    }
}
