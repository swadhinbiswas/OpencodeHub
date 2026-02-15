/**
 * Auto-merge Library
 * Handles automatic merging of PRs when conditions are met
 */

import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { addToMergeQueue } from "./merge-queue";
import { evaluateAutoMergeRules } from "./auto-merge-rules";

export interface AutoMergeOptions {
    mergeMethod: "merge" | "squash" | "rebase";
    deleteHeadBranch?: boolean;
    commitTitle?: string;
    commitMessage?: string;
}

export interface AutoMergeStatus {
    enabled: boolean;
    eligibleToMerge: boolean;
    blockers: string[];
    enabledBy?: string;
    enabledAt?: Date;
}

/**
 * Enable auto-merge for a PR
 */
export async function enableAutoMerge(
    prId: string,
    userId: string,
    options: AutoMergeOptions
): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase();

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prId),
    });

    if (!pr) {
        return { success: false, error: "Pull request not found" };
    }

    if (pr.state !== "open" || pr.isDraft) {
        return { success: false, error: "Cannot enable auto-merge on closed or draft PRs" };
    }

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.pullRequests)
            .set({
                allowAutoMerge: true,
                autoMergeMethod: options.mergeMethod,
                autoMergeEnabledById: userId,
                autoMergeEnabledAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(schema.pullRequests.id, prId));

        logger.info({ prId, userId, method: options.mergeMethod }, "Auto-merge enabled");

        // Check if already eligible
        await processAutoMerge(prId);

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: message };
    }
}

/**
 * Disable auto-merge for a PR
 */
export async function disableAutoMerge(prId: string): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.pullRequests)
            .set({
                allowAutoMerge: false,
                autoMergeMethod: null,
                autoMergeEnabledById: null,
                autoMergeEnabledAt: null,
                updatedAt: new Date(),
            })
            .where(eq(schema.pullRequests.id, prId));

        logger.info({ prId }, "Auto-merge disabled");
        return true;
    } catch (error) {
        logger.error({ prId, error }, "Failed to disable auto-merge");
        return false;
    }
}

/**
 * Check if a PR is eligible for auto-merge
 */
export async function checkAutoMergeEligibility(prId: string): Promise<AutoMergeStatus> {
    const db = getDatabase();

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prId),
        with: {
            checks: true,
            reviews: true,
        },
    });

    if (!pr) {
        return { enabled: false, eligibleToMerge: false, blockers: ["PR not found"] };
    }

    if (!pr.allowAutoMerge) {
        return { enabled: false, eligibleToMerge: false, blockers: [] };
    }

    const blockers: string[] = [];

    // Check PR state
    if (pr.state !== "open") {
        blockers.push("PR is not open");
    }

    if (pr.isDraft) {
        blockers.push("PR is a draft");
    }

    // Check mergeable status
    if (pr.mergeable === false) {
        blockers.push("PR has merge conflicts");
    }

    if (pr.mergeableState === "blocked") {
        blockers.push("PR is blocked by branch protection");
    }

    // Check CI status
    const checks = pr.checks || [];
    const failingChecks = checks.filter(
        c => c.status === "completed" && c.conclusion !== "success" && c.conclusion !== "neutral"
    );
    const pendingChecks = checks.filter(c => c.status !== "completed");

    if (failingChecks.length > 0) {
        blockers.push(`${failingChecks.length} failing check(s)`);
    }

    if (pendingChecks.length > 0) {
        blockers.push(`${pendingChecks.length} pending check(s)`);
    }

    // Check reviews
    const reviews = pr.reviews || [];
    const approvals = reviews.filter(r => r.state === "approved");
    const changesRequested = reviews.filter(r => r.state === "changes_requested");

    if (changesRequested.length > 0) {
        blockers.push("Changes requested by reviewer(s)");
    }

    const ruleBlockers = await evaluateAutoMergeRules(prId);
    blockers.push(...ruleBlockers);

    // Get enabler info
    let enabledBy: string | undefined;
    if (pr.autoMergeEnabledById) {
        const user = await db.query.users.findFirst({
            where: eq(schema.users.id, pr.autoMergeEnabledById),
            columns: { username: true },
        });
        enabledBy = user?.username;
    }

    return {
        enabled: true,
        eligibleToMerge: blockers.length === 0,
        blockers,
        enabledBy,
        enabledAt: pr.autoMergeEnabledAt || undefined,
    };
}

/**
 * Process auto-merge for a PR if eligible
 */
export async function processAutoMerge(prId: string): Promise<boolean> {
    const status = await checkAutoMergeEligibility(prId);

    if (!status.enabled || !status.eligibleToMerge) {
        return false;
    }

    const db = getDatabase();
    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prId),
    });

    if (!pr || !pr.autoMergeEnabledById) {
        return false;
    }

    try {
        // Add to merge queue for processing
        await addToMergeQueue({
            repositoryId: pr.repositoryId,
            pullRequestId: prId,
            addedById: pr.autoMergeEnabledById,
            mergeMethod: (pr.autoMergeMethod as "merge" | "squash" | "rebase") || "merge",
        });

        logger.info({ prId }, "PR added to merge queue via auto-merge");
        return true;
    } catch (error) {
        logger.error({ prId, error }, "Failed to process auto-merge");
        return false;
    }
}

/**
 * Get auto-merge status for display
 */
export async function getAutoMergeStatus(prId: string): Promise<AutoMergeStatus> {
    return checkAutoMergeEligibility(prId);
}
