/**
 * Stack Approvals Library
 * Calculate and validate approval status across entire stacks
 */

import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { getStack } from "./stacks";
import { logger } from "./logger";
import crypto from "crypto";

export interface StackApprovalStatus {
    stackId: string;
    allApproved: boolean;
    prs: {
        prId: string;
        prNumber: number;
        title: string;
        isApproved: boolean;
        approvalCount: number;
        requiredApprovals: number;
        changesRequested: boolean;
    }[];
}

/**
 * Get approval status for an entire stack
 */
export async function getStackApprovalStatus(stackId: string): Promise<StackApprovalStatus | null> {
    const stack = await getStack(stackId);
    if (!stack) return null;

    const db = getDatabase();
    const reviewRequirements = await db.query.reviewRequirements.findFirst({
        where: eq(schema.reviewRequirements.repositoryId, stack.stack.repositoryId),
    });

    const rules = await db.query.branchProtection.findMany({
        where: and(
            eq(schema.branchProtection.repositoryId, stack.stack.repositoryId),
            eq(schema.branchProtection.active, true)
        )
    });

    const prs: StackApprovalStatus["prs"] = [];

    for (const entry of stack.entries) {
        const reviews = await db.query.pullRequestReviews.findMany({
            where: eq(schema.pullRequestReviews.pullRequestId, entry.pr.id),
        });

        const approvals = reviews.filter(r => r.state === "approved");
        const changesRequested = reviews.some(r => r.state === "changes_requested");

        const matchingRule = rules.find(rule => {
            if (rule.pattern === entry.pr.baseBranch) return true;
            if (rule.pattern.endsWith("*")) {
                return entry.pr.baseBranch.startsWith(rule.pattern.slice(0, -1));
            }
            return false;
        });

        const requiredApprovals = Math.max(
            reviewRequirements?.minApprovals ?? 0,
            matchingRule ? (matchingRule.requiredApprovals ?? 1) : 0
        );

        prs.push({
            prId: entry.pr.id,
            prNumber: entry.pr.number,
            title: entry.pr.title,
            isApproved: approvals.length >= requiredApprovals && !changesRequested,
            approvalCount: approvals.length,
            requiredApprovals,
            changesRequested,
        });
    }

    return {
        stackId,
        allApproved: prs.every(pr => pr.isApproved),
        prs,
    };
}

/**
 * Check if a stack can be merged (all PRs approved)
 */
export async function canMergeStack(stackId: string): Promise<{
    canMerge: boolean;
    blockers: string[];
}> {
    const status = await getStackApprovalStatus(stackId);
    if (!status) {
        return { canMerge: false, blockers: ["Stack not found"] };
    }

    const blockers: string[] = [];

    for (const pr of status.prs) {
        if (!pr.isApproved) {
            if (pr.changesRequested) {
                blockers.push(`PR #${pr.prNumber}: Changes requested`);
            } else {
                blockers.push(`PR #${pr.prNumber}: Needs ${pr.requiredApprovals - pr.approvalCount} more approval(s)`);
            }
        }
    }

    return {
        canMerge: blockers.length === 0,
        blockers,
    };
}

/**
 * Request approval for all PRs in a stack
 */
export async function requestStackApproval(
    stackId: string,
    reviewerIds: string[]
): Promise<boolean> {
    const stack = await getStack(stackId);
    if (!stack) return false;

    const db = getDatabase();

    try {
        for (const entry of stack.entries) {
            for (const reviewerId of reviewerIds) {
                // Check if already requested
                const existing = await db.query.pullRequestReviewers.findFirst({
                    where: and(
                        eq(schema.pullRequestReviewers.pullRequestId, entry.pr.id),
                        eq(schema.pullRequestReviewers.userId, reviewerId)
                    ),
                });

                if (!existing) {
                    // @ts-expect-error - Drizzle multi-db union type issue
                    await db.insert(schema.pullRequestReviewers).values({
                        id: crypto.randomUUID(),
                        pullRequestId: entry.pr.id,
                        userId: reviewerId,
                        isRequired: true,
                        requestedAt: new Date(),
                    });
                }
            }
        }

        logger.info({ stackId, reviewerCount: reviewerIds.length }, "Stack approval requested");
        return true;
    } catch (error) {
        logger.error({ stackId, error }, "Failed to request stack approval");
        return false;
    }
}
