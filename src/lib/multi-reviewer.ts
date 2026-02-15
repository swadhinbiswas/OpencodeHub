/**
 * Multi-reviewer Rules Library
 * Advanced reviewer assignment and requirement rules
 */

import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger";
import micromatch from "micromatch";

export interface ReviewerRule {
    type: "user" | "team" | "codeowner" | "random";
    targetId?: string; // User or team ID
    count?: number; // How many reviewers needed
    pathPattern?: string; // Apply to specific paths
}

export interface ReviewRequirement {
    minApprovals: number;
    requireCodeOwner: boolean;
    requireTeamLead: boolean;
    dismissStaleReviews: boolean;
    requireReReviewOnPush: boolean;
}

export interface ReviewStatus {
    approved: boolean;
    approvalCount: number;
    requiredApprovals: number;
    changesRequested: boolean;
    pendingReviewers: { userId: string; username: string }[];
    missingRequirements: string[];
}

/**
 * Get review status for a PR
 */
export async function getReviewStatus(prId: string): Promise<ReviewStatus> {
    const db = getDatabase();

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prId),
        with: {
            reviews: {
                with: { reviewer: true },
            },
            reviewers: {
                with: { user: true },
            },
        },
    });

    if (!pr) {
        return {
            approved: false,
            approvalCount: 0,
            requiredApprovals: 1,
            changesRequested: false,
            pendingReviewers: [],
            missingRequirements: ["PR not found"],
        };
    }

    const reviews = pr.reviews || [];
    const requestedReviewers = pr.reviewers || [];

    // Get latest review per reviewer
    const latestReviews = new Map<string, typeof reviews[0]>();
    for (const review of reviews) {
        const existing = latestReviews.get(review.reviewerId);
        if (!existing || new Date(review.createdAt) > new Date(existing.createdAt)) {
            latestReviews.set(review.reviewerId, review);
        }
    }

    const approvals = Array.from(latestReviews.values()).filter(r => r.state === "approved");
    const changesRequested = Array.from(latestReviews.values()).some(r => r.state === "changes_requested");

    // Find pending reviewers
    const reviewedBy = new Set(latestReviews.keys());
    const pendingReviewers = requestedReviewers
        .filter(r => !reviewedBy.has(r.userId))
        .map(r => ({
            userId: r.userId,
            username: r.user?.username || "Unknown",
        }));

    // Get required approvals from branch protection (simplified)
    const requiredApprovals = 1; // Would come from branch protection rules

    const missingRequirements: string[] = [];
    if (approvals.length < requiredApprovals) {
        missingRequirements.push(`Needs ${requiredApprovals - approvals.length} more approval(s)`);
    }
    if (changesRequested) {
        missingRequirements.push("Changes requested by reviewer");
    }
    if (pendingReviewers.length > 0) {
        missingRequirements.push(`${pendingReviewers.length} reviewer(s) haven't reviewed yet`);
    }

    return {
        approved: approvals.length >= requiredApprovals && !changesRequested,
        approvalCount: approvals.length,
        requiredApprovals,
        changesRequested,
        pendingReviewers,
        missingRequirements,
    };
}

/**
 * Auto-assign reviewers based on rules
 */
export async function autoAssignReviewers(
    prId: string,
    rules: ReviewerRule[],
    changedFiles: string[] = []
): Promise<string[]> {
    const db = getDatabase();
    const assignedReviewers: string[] = [];

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prId),
    });

    if (!pr) return [];

    for (const rule of rules) {
        if (rule.pathPattern && changedFiles.length > 0) {
            const matches = micromatch(changedFiles, rule.pathPattern, { dot: true });
            if (matches.length === 0) {
                continue;
            }
        }
        if (rule.type === "user" && rule.targetId) {
            // Don't assign author as reviewer
            if (rule.targetId !== pr.authorId) {
                assignedReviewers.push(rule.targetId);
            }
        } else if (rule.type === "team" && rule.targetId) {
            // Get team members
            const members = await db.query.teamMembers.findMany({
                where: eq(schema.teamMembers.teamId, rule.targetId),
            });

            // Exclude author
            const eligibleMembers = members.filter(m => m.userId !== pr.authorId);

            if (rule.count && rule.count < eligibleMembers.length) {
                // Random selection
                const shuffled = eligibleMembers.sort(() => 0.5 - Math.random());
                assignedReviewers.push(...shuffled.slice(0, rule.count).map(m => m.userId));
            } else {
                assignedReviewers.push(...eligibleMembers.map(m => m.userId));
            }
        } else if (rule.type === "random" && rule.count) {
            // Get repo collaborators
            const collaborators = await db.query.repositoryCollaborators.findMany({
                where: eq(schema.repositoryCollaborators.repositoryId, pr.repositoryId),
            });

            const eligible = collaborators.filter(c => c.userId !== pr.authorId);
            const shuffled = eligible.sort(() => 0.5 - Math.random());
            assignedReviewers.push(...shuffled.slice(0, rule.count).map(c => c.userId));
        }
    }

    // Add as requested reviewers
    const uniqueReviewers = [...new Set(assignedReviewers)];
    for (const userId of uniqueReviewers) {
        const existing = await db.query.pullRequestReviewers.findFirst({
            where: and(
                eq(schema.pullRequestReviewers.pullRequestId, prId),
                eq(schema.pullRequestReviewers.userId, userId)
            ),
        });

        if (!existing) {
            // @ts-expect-error - Drizzle multi-db union type issue
            await db.insert(schema.pullRequestReviewers).values({
                id: crypto.randomUUID(),
                pullRequestId: prId,
                userId,
                isRequired: true,
                requestedAt: new Date(),
            });
        }
    }

    logger.info({ prId, reviewerCount: uniqueReviewers.length }, "Reviewers auto-assigned");

    return uniqueReviewers;
}

/**
 * Check if review should be dismissed (stale review detection)
 */
export async function checkStaleReviews(prId: string): Promise<{
    stale: boolean;
    staleReviewIds: string[];
}> {
    const db = getDatabase();

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prId),
        with: { reviews: true },
    });

    if (!pr) return { stale: false, staleReviewIds: [] };

    const staleReviewIds: string[] = [];

    for (const review of pr.reviews || []) {
        // Review is stale if it was made before the current head commit
        if (review.commitSha && review.commitSha !== pr.headSha) {
            staleReviewIds.push(review.id);
        }
    }

    return {
        stale: staleReviewIds.length > 0,
        staleReviewIds,
    };
}

/**
 * Dismiss stale reviews
 */
export async function dismissStaleReviews(
    prId: string,
    dismissedById: string,
    reason: string = "Dismissed due to new commits"
): Promise<number> {
    const db = getDatabase();
    const { staleReviewIds } = await checkStaleReviews(prId);

    for (const reviewId of staleReviewIds) {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.pullRequestReviews)
            .set({
                state: "dismissed",
                dismissedAt: new Date(),
                dismissedById,
                dismissalReason: reason,
                updatedAt: new Date(),
            })
            .where(eq(schema.pullRequestReviews.id, reviewId));
    }

    if (staleReviewIds.length > 0) {
        logger.info({ prId, count: staleReviewIds.length }, "Stale reviews dismissed");
    }

    return staleReviewIds.length;
}
