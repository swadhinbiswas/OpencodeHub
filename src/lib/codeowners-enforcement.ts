/**
 * CODEOWNERS Enforcement Library
 * Validates that all required code owners have approved before merge
 */

import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { parseCodeOwners, findOwnersForFiles, CODEOWNERS_PATHS } from "./codeowners";
import { getFileContent } from "./git";

interface CodeOwnerCheck {
    canMerge: boolean;
    missingApprovals: {
        path: string;
        requiredOwners: string[];
        approvedBy: string[];
    }[];
}

/**
 * Check if all required code owners have approved a PR
 */
export async function checkCodeOwnerApprovals(
    repositoryId: string,
    pullRequestId: string,
    changedFiles: string[]
): Promise<CodeOwnerCheck> {
    const db = getDatabase();

    // Get repository info
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repositoryId),
    });

    if (!repo) {
        return { canMerge: true, missingApprovals: [] };
    }

    // Try to find CODEOWNERS file
    let codeOwnersContent: string | null = null;
    for (const path of CODEOWNERS_PATHS) {
        try {
            const result = await getFileContent(repositoryId, repo.defaultBranch, path);
            if (result && result.content) {
                codeOwnersContent = result.content;
                break;
            }
        } catch {
            // File doesn't exist at this path
        }
    }

    if (!codeOwnersContent) {
        // No CODEOWNERS file - allow merge
        return { canMerge: true, missingApprovals: [] };
    }

    // Parse CODEOWNERS
    const codeOwners = parseCodeOwners(codeOwnersContent);

    // Get all required owners for changed files
    const allOwners = findOwnersForFiles(codeOwners, changedFiles);

    if (allOwners.length === 0) {
        return { canMerge: true, missingApprovals: [] };
    }

    // Get PR approvals
    const reviews = await db.query.pullRequestReviews.findMany({
        where: and(
            eq(schema.pullRequestReviews.pullRequestId, pullRequestId),
            eq(schema.pullRequestReviews.state, "approved")
        ),
    });

    // Get usernames of approvers
    const approverIds = reviews.map(r => r.reviewerId);
    const approverUsernames = new Set<string>();

    if (approverIds.length > 0) {
        const approvers = await db.query.users.findMany({
            where: inArray(schema.users.id, approverIds),
        });
        approvers.forEach(u => approverUsernames.add(u.username.toLowerCase()));
    }

    // Check if all owners have approved
    const missingApprovals: CodeOwnerCheck["missingApprovals"] = [];

    // Group by path for better error messages
    const pathOwnerMap = new Map<string, Set<string>>();
    for (const file of changedFiles) {
        const owners = findOwnersForFiles(codeOwners, [file]);
        if (owners.length > 0) {
            pathOwnerMap.set(file, new Set(owners.map(o => o.replace("@", "").toLowerCase())));
        }
    }

    for (const [path, requiredOwners] of pathOwnerMap) {
        const requiredArray = Array.from(requiredOwners);
        const hasApproval = requiredArray.some(owner => approverUsernames.has(owner));

        if (!hasApproval) {
            missingApprovals.push({
                path,
                requiredOwners: requiredArray.map(o => `@${o}`),
                approvedBy: Array.from(approverUsernames),
            });
        }
    }

    const canMerge = missingApprovals.length === 0;

    if (!canMerge) {
        logger.info({
            pullRequestId,
            missingCount: missingApprovals.length,
        }, "CODEOWNERS approval check failed");
    }

    return { canMerge, missingApprovals };
}

/**
 * Get a summary of CODEOWNERS requirements for a PR
 */
export async function getCodeOwnersSummary(
    repositoryId: string,
    changedFiles: string[]
): Promise<{ path: string; owners: string[] }[]> {
    const db = getDatabase();

    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repositoryId),
    });

    if (!repo) return [];

    // Try to find CODEOWNERS file
    for (const path of CODEOWNERS_PATHS) {
        try {
            const result = await getFileContent(repositoryId, repo.defaultBranch, path);
            if (result?.content) {
                const codeOwners = parseCodeOwners(result.content);
                return changedFiles.map(file => ({
                    path: file,
                    owners: findOwnersForFiles(codeOwners, [file]),
                }));
            }
        } catch {
            // Continue to next path
        }
    }

    return [];
}
