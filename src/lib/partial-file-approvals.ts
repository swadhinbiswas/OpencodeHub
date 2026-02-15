/**
 * Partial File Approvals Library
 * Allow approving specific files within a PR
 */

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { pullRequests } from "@/db/schema/pull-requests";
import { users } from "@/db/schema/users";

/**
 * File-level approvals table
 */
export const fileApprovals = pgTable("file_approvals", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    path: text("path").notNull(), // File path
    approvedById: text("approved_by_id")
        .notNull()
        .references(() => users.id),
    approvedAt: timestamp("approved_at").notNull().defaultNow(),
    commitSha: text("commit_sha").notNull(), // SHA when approved
    comment: text("comment"),
});

export type FileApproval = typeof fileApprovals.$inferSelect;

/**
 * Approve a specific file in a PR
 */
export async function approveFile(options: {
    pullRequestId: string;
    path: string;
    approvedById: string;
    comment?: string;
}): Promise<FileApproval> {
    const db = getDatabase();

    // Get current PR head
    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, options.pullRequestId),
    });

    if (!pr) {
        throw new Error("Pull request not found");
    }

    // Check for existing approval
    const existing = await db.query.fileApprovals?.findFirst({
        where: and(
            eq(schema.fileApprovals.pullRequestId, options.pullRequestId),
            eq(schema.fileApprovals.path, options.path),
            eq(schema.fileApprovals.approvedById, options.approvedById)
        ),
    });

    if (existing) {
        // Update existing approval
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.fileApprovals)
            .set({
                commitSha: pr.headSha,
                approvedAt: new Date(),
                comment: options.comment,
            })
            .where(eq(schema.fileApprovals.id, existing.id));

        return { ...existing, commitSha: pr.headSha, approvedAt: new Date() };
    }

    const approval: FileApproval = {
        id: crypto.randomUUID(),
        pullRequestId: options.pullRequestId,
        path: options.path,
        approvedById: options.approvedById,
        approvedAt: new Date(),
        commitSha: pr.headSha,
        comment: options.comment || null,
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.fileApprovals).values(approval);

    logger.info({ prId: options.pullRequestId, path: options.path }, "File approved");

    return approval;
}

/**
 * Get file approval status for a PR
 */
export async function getFileApprovalStatus(prId: string): Promise<{
    files: { path: string; approved: boolean; approvers: string[]; stale: boolean }[];
    allApproved: boolean;
}> {
    const db = getDatabase();

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prId),
    });

    if (!pr) {
        return { files: [], allApproved: false };
    }

    // Get changed files (would need git diff in real implementation)
    // For now, return approvals we have
    const approvals = await db.query.fileApprovals?.findMany({
        where: eq(schema.fileApprovals.pullRequestId, prId),
        with: { approvedBy: { columns: { username: true } } },
    }) || [];

    // Group by path
    const fileMap = new Map<string, { approvers: string[]; stale: boolean }>();

    for (const approval of approvals) {
        if (!fileMap.has(approval.path)) {
            fileMap.set(approval.path, { approvers: [], stale: false });
        }
        const file = fileMap.get(approval.path)!;
        file.approvers.push(approval.approvedBy?.username || "Unknown");
        if (approval.commitSha !== pr.headSha) {
            file.stale = true;
        }
    }

    const files = Array.from(fileMap.entries()).map(([path, data]) => ({
        path,
        approved: data.approvers.length > 0 && !data.stale,
        approvers: data.approvers,
        stale: data.stale,
    }));

    return {
        files,
        allApproved: files.every(f => f.approved),
    };
}

/**
 * Revoke a file approval
 */
export async function revokeFileApproval(
    approvalId: string
): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.delete(schema.fileApprovals)
            .where(eq(schema.fileApprovals.id, approvalId));
        return true;
    } catch (error) {
        logger.error({ approvalId, error }, "Failed to revoke file approval");
        return false;
    }
}

/**
 * Get files needing approval (not yet approved or stale)
 */
export async function getFilesNeedingApproval(prId: string): Promise<string[]> {
    const status = await getFileApprovalStatus(prId);
    return status.files
        .filter(f => !f.approved || f.stale)
        .map(f => f.path);
}
