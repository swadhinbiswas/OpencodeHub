/**
 * PR-Issue Linking Library
 * Enhanced linking between PRs and Issues
 */

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and, or, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { pullRequests } from "@/db/schema/pull-requests";
import { issues } from "@/db/schema/issues";

/**
 * Explicit PR-Issue links
 */
export const prIssueLinks = pgTable("pr_issue_links", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    issueId: text("issue_id")
        .notNull()
        .references(() => issues.id, { onDelete: "cascade" }),
    linkType: text("link_type").notNull(), // closes, fixes, relates, blocks, duplicates
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PRIssueLink = typeof prIssueLinks.$inferSelect;

// Keywords that indicate PR closes an issue
const CLOSING_KEYWORDS = [
    "close", "closes", "closed",
    "fix", "fixes", "fixed",
    "resolve", "resolves", "resolved",
];

/**
 * Parse issue references from text
 */
export function parseIssueReferences(text: string): {
    number: number;
    type: "closes" | "fixes" | "relates";
}[] {
    const references: { number: number; type: "closes" | "fixes" | "relates" }[] = [];

    // Pattern: (keyword) #number or (keyword) repo#number
    for (const keyword of CLOSING_KEYWORDS) {
        const regex = new RegExp(`${keyword}\\s+#(\\d+)`, "gi");
        let match;
        while ((match = regex.exec(text)) !== null) {
            const type = keyword.startsWith("fix") ? "fixes" : "closes";
            references.push({ number: parseInt(match[1]), type });
        }
    }

    // Pattern: just #number (relates)
    const relatesRegex = /#(\d+)/g;
    let match;
    while ((match = relatesRegex.exec(text)) !== null) {
        const num = parseInt(match[1]);
        if (!references.some(r => r.number === num)) {
            references.push({ number: num, type: "relates" });
        }
    }

    return references;
}

/**
 * Link PR to Issue
 */
export async function linkPRToIssue(options: {
    pullRequestId: string;
    issueId: string;
    linkType: "closes" | "fixes" | "relates" | "blocks" | "duplicates";
    createdById: string;
}): Promise<PRIssueLink> {
    const db = getDatabase();

    // Check for existing link
    const existing = await db.query.prIssueLinks?.findFirst({
        where: and(
            eq(schema.prIssueLinks.pullRequestId, options.pullRequestId),
            eq(schema.prIssueLinks.issueId, options.issueId)
        ),
    });

    if (existing) {
        // Update link type
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.prIssueLinks)
            .set({ linkType: options.linkType })
            .where(eq(schema.prIssueLinks.id, existing.id));

        return { ...existing, linkType: options.linkType };
    }

    const link = {
        id: crypto.randomUUID(),
        pullRequestId: options.pullRequestId,
        issueId: options.issueId,
        linkType: options.linkType,
        createdById: options.createdById,
        createdAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.prIssueLinks).values(link);

    logger.info({ prId: options.pullRequestId, issueId: options.issueId, type: options.linkType }, "PR-Issue linked");

    return link as PRIssueLink;
}

/**
 * Auto-link PR to issues based on description/title
 */
export async function autoLinkPR(
    pullRequestId: string,
    createdById: string
): Promise<PRIssueLink[]> {
    const db = getDatabase();

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, pullRequestId),
    });

    if (!pr) return [];

    const textToSearch = `${pr.title} ${pr.body || ""}`;
    const references = parseIssueReferences(textToSearch);

    const links: PRIssueLink[] = [];

    for (const ref of references) {
        // Find issue by number in same repo
        const issue = await db.query.issues.findFirst({
            where: and(
                eq(schema.issues.repositoryId, pr.repositoryId),
                eq(schema.issues.number, ref.number)
            ),
        });

        if (issue) {
            const link = await linkPRToIssue({
                pullRequestId,
                issueId: issue.id,
                linkType: ref.type,
                createdById,
            });
            links.push(link);
        }
    }

    return links;
}

/**
 * Get issues linked to a PR
 */
export async function getLinkedIssues(pullRequestId: string): Promise<{
    link: PRIssueLink;
    issue: typeof schema.issues.$inferSelect;
}[]> {
    const db = getDatabase();

    try {
        const links = await db.query.prIssueLinks?.findMany({
            where: eq(schema.prIssueLinks.pullRequestId, pullRequestId),
        }) || [];

        const results = [];

        for (const link of links) {
            const issue = await db.query.issues.findFirst({
                where: eq(schema.issues.id, link.issueId),
            });

            if (issue) {
                results.push({ link, issue });
            }
        }

        return results;
    } catch {
        return [];
    }
}

/**
 * Get PRs linked to an issue
 */
export async function getLinkedPRs(issueId: string): Promise<{
    link: PRIssueLink;
    pr: typeof schema.pullRequests.$inferSelect;
}[]> {
    const db = getDatabase();

    try {
        const links = await db.query.prIssueLinks?.findMany({
            where: eq(schema.prIssueLinks.issueId, issueId),
        }) || [];

        const results = [];

        for (const link of links) {
            const pr = await db.query.pullRequests.findFirst({
                where: eq(schema.pullRequests.id, link.pullRequestId),
            });

            if (pr) {
                results.push({ link, pr });
            }
        }

        return results;
    } catch {
        return [];
    }
}

/**
 * Close linked issues when PR is merged
 */
export async function closeLinkedIssuesOnMerge(
    pullRequestId: string,
    userId: string
): Promise<string[]> {
    const db = getDatabase();
    const closedIssueIds: string[] = [];

    try {
        const links = await db.query.prIssueLinks?.findMany({
            where: and(
                eq(schema.prIssueLinks.pullRequestId, pullRequestId),
                or(
                    eq(schema.prIssueLinks.linkType, "closes"),
                    eq(schema.prIssueLinks.linkType, "fixes")
                )
            ),
        }) || [];

        for (const link of links) {
            // @ts-expect-error - Drizzle multi-db union type issue
            await db.update(schema.issues)
                .set({
                    state: "closed",
                    closedAt: new Date(),
                    closedById: userId,
                    updatedAt: new Date(),
                })
                .where(eq(schema.issues.id, link.issueId));

            closedIssueIds.push(link.issueId);
        }

        if (closedIssueIds.length > 0) {
            logger.info({ prId: pullRequestId, closedCount: closedIssueIds.length }, "Issues closed on PR merge");
        }
    } catch (error) {
        logger.error({ pullRequestId, error }, "Failed to close linked issues");
    }

    return closedIssueIds;
}

/**
 * Unlink PR from Issue
 */
export async function unlinkPRFromIssue(linkId: string): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.delete(schema.prIssueLinks)
            .where(eq(schema.prIssueLinks.id, linkId));
        return true;
    } catch {
        return false;
    }
}
