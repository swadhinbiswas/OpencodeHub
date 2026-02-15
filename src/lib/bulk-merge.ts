/**
 * Bulk Merge Library
 * Merge entire stacks or multiple PRs at once
 */

import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getStack } from "./stacks";
import { canMergeStack } from "./stack-approvals";
import { addToMergeQueue } from "./merge-queue";
import { logger } from "./logger";

export interface BulkMergeResult {
    success: boolean;
    merged: { prId: string; prNumber: number }[];
    failed: { prId: string; prNumber: number; reason: string }[];
    skipped: { prId: string; prNumber: number; reason: string }[];
}

/**
 * Merge an entire stack in order
 */
export async function bulkMergeStack(
    stackId: string,
    userId: string,
    options?: {
        mergeMethod?: "merge" | "squash" | "rebase";
        skipApprovalCheck?: boolean;
    }
): Promise<BulkMergeResult> {
    const stack = await getStack(stackId);

    if (!stack) {
        return {
            success: false,
            merged: [],
            failed: [],
            skipped: [{ prId: "", prNumber: 0, reason: "Stack not found" }],
        };
    }

    // Check if stack can be merged
    if (!options?.skipApprovalCheck) {
        const { canMerge, blockers } = await canMergeStack(stackId);
        if (!canMerge) {
            return {
                success: false,
                merged: [],
                failed: [],
                skipped: stack.entries.map(e => ({
                    prId: e.pr.id,
                    prNumber: e.pr.number,
                    reason: blockers.join(", "),
                })),
            };
        }
    }

    const result: BulkMergeResult = {
        success: true,
        merged: [],
        failed: [],
        skipped: [],
    };

    // Process PRs in stack order (bottom to top)
    for (const { entry, pr } of stack.entries) {
        // Skip already merged PRs
        if (pr.isMerged) {
            result.skipped.push({
                prId: pr.id,
                prNumber: pr.number,
                reason: "Already merged",
            });
            continue;
        }

        // Skip closed PRs
        if (pr.state === "closed") {
            result.skipped.push({
                prId: pr.id,
                prNumber: pr.number,
                reason: "PR is closed",
            });
            continue;
        }

        // Add to merge queue
        try {
            await addToMergeQueue({
                repositoryId: stack.stack.repositoryId,
                pullRequestId: pr.id,
                addedById: userId,
                mergeMethod: options?.mergeMethod || "merge",
            });

            result.merged.push({
                prId: pr.id,
                prNumber: pr.number,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            result.failed.push({
                prId: pr.id,
                prNumber: pr.number,
                reason: message,
            });
            result.success = false;
        }
    }

    logger.info({
        stackId,
        merged: result.merged.length,
        failed: result.failed.length,
        skipped: result.skipped.length,
    }, "Bulk merge completed");

    return result;
}

/**
 * Merge multiple PRs (not necessarily in a stack)
 */
export async function bulkMergePRs(
    prIds: string[],
    userId: string,
    options?: {
        mergeMethod?: "merge" | "squash" | "rebase";
    }
): Promise<BulkMergeResult> {
    const db = getDatabase();
    const result: BulkMergeResult = {
        success: true,
        merged: [],
        failed: [],
        skipped: [],
    };

    for (const prId of prIds) {
        const pr = await db.query.pullRequests.findFirst({
            where: eq(schema.pullRequests.id, prId),
        });

        if (!pr) {
            result.skipped.push({ prId, prNumber: 0, reason: "PR not found" });
            continue;
        }

        if (pr.isMerged) {
            result.skipped.push({ prId, prNumber: pr.number, reason: "Already merged" });
            continue;
        }

        if (pr.state !== "open") {
            result.skipped.push({ prId, prNumber: pr.number, reason: "PR not open" });
            continue;
        }

        try {
            await addToMergeQueue({
                repositoryId: pr.repositoryId,
                pullRequestId: prId,
                addedById: userId,
                mergeMethod: options?.mergeMethod || "merge",
            });

            result.merged.push({ prId, prNumber: pr.number });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            result.failed.push({ prId, prNumber: pr.number, reason: message });
            result.success = false;
        }
    }

    return result;
}
