/**
 * Suggested Changes Library
 * Parse, render, and apply code suggestions from review comments
 */

import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { generateId } from "./utils";

/**
 * Parse suggestion from comment body
 * GitHub-style: ```suggestion ... ```
 */
export function parseSuggestion(commentBody: string): {
    hasSuggestion: boolean;
    suggestionContent: string | null;
    textBeforeSuggestion: string;
    textAfterSuggestion: string;
} {
    const suggestionRegex = /```suggestion\n([\s\S]*?)```/g;
    const match = suggestionRegex.exec(commentBody);

    if (!match) {
        return {
            hasSuggestion: false,
            suggestionContent: null,
            textBeforeSuggestion: commentBody,
            textAfterSuggestion: "",
        };
    }

    const suggestionContent = match[1];
    const textBeforeSuggestion = commentBody.slice(0, match.index).trim();
    const textAfterSuggestion = commentBody.slice(match.index + match[0].length).trim();

    return {
        hasSuggestion: true,
        suggestionContent,
        textBeforeSuggestion,
        textAfterSuggestion,
    };
}

/**
 * Create a comment with a suggestion
 */
export async function createSuggestionComment(options: {
    pullRequestId: string;
    authorId: string;
    path: string;
    line: number;
    startLine?: number;
    side?: "LEFT" | "RIGHT";
    commitSha: string;
    suggestionContent: string;
    body?: string;
    reviewId?: string;
}): Promise<string> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const id = generateId();

    // Format body with suggestion block
    const formattedBody = options.body
        ? `${options.body}\n\n\`\`\`suggestion\n${options.suggestionContent}\`\`\``
        : `\`\`\`suggestion\n${options.suggestionContent}\`\`\``;

    await db.insert(schema.pullRequestComments).values({
        id,
        pullRequestId: options.pullRequestId,
        authorId: options.authorId,
        reviewId: options.reviewId,
        path: options.path,
        line: options.line,
        startLine: options.startLine,
        side: options.side || "RIGHT",
        commitSha: options.commitSha,
        body: formattedBody,
        suggestionContent: options.suggestionContent,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    logger.info({ commentId: id, pullRequestId: options.pullRequestId }, "Created suggestion comment");
    return id;
}

/**
 * Apply a suggestion to the PR branch
 */
export async function applySuggestion(
    commentId: string,
    appliedById: string
): Promise<{ success: boolean; commitSha?: string; error?: string }> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get comment with suggestion
    const comment = await db.query.pullRequestComments.findFirst({
        where: eq(schema.pullRequestComments.id, commentId),
        with: {
            pullRequest: {
                with: {
                    repository: true,
                },
            },
        },
    });

    if (!comment) {
        return { success: false, error: "Comment not found" };
    }

    if (!comment.suggestionContent) {
        return { success: false, error: "Comment has no suggestion" };
    }

    if (comment.suggestionApplied) {
        return { success: false, error: "Suggestion already applied" };
    }

    if (!comment.path || !comment.line) {
        return { success: false, error: "Comment missing file path or line number" };
    }

    const pr = comment.pullRequest;
    if (!pr || !pr.repository) {
        return { success: false, error: "Pull request or repository not found" };
    }

    try {
        // Import git functions dynamically
        const { resolveRepoPath } = await import("./git-storage");
        const { getFileContent, getGit } = await import("./git");

        const repoPath = await resolveRepoPath(pr.repository.diskPath);

        // Get current file content
        const fileResult = await getFileContent(repoPath, comment.path, pr.headBranch);
        if (!fileResult) {
            return { success: false, error: "File not found" };
        }

        const lines = fileResult.content.split("\n");
        const startLine = comment.startLine || comment.line;
        const endLine = comment.line;

        // Validate line numbers
        if (startLine < 1 || endLine > lines.length) {
            return { success: false, error: "Invalid line numbers" };
        }

        // Apply the suggestion
        const newLines = [
            ...lines.slice(0, startLine - 1),
            ...comment.suggestionContent.split("\n"),
            ...lines.slice(endLine),
        ];

        const newContent = newLines.join("\n");

        // Create a working copy and apply changes
        const git = getGit(repoPath);
        const tempPath = `${repoPath}.worktree`;

        // Use git worktree for applying changes
        const fs = await import("fs/promises");
        const path = await import("path");

        // Clone to temp for modification
        await fs.mkdir(tempPath, { recursive: true });
        const workGit = (await import("simple-git")).simpleGit(tempPath);
        await workGit.clone(repoPath, tempPath, ["--branch", pr.headBranch]);

        // Write the modified file
        const filePath = path.join(tempPath, comment.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, newContent);

        // Get user info for commit
        const user = await db.query.users.findFirst({
            where: eq(schema.users.id, appliedById),
        });

        // Commit the change
        await workGit.addConfig("user.name", user?.displayName || "OpenCodeHub");
        await workGit.addConfig("user.email", user?.email || "noreply@opencodehub.local");
        await workGit.add(comment.path);

        // Get PR author for co-author attribution
        const prAuthor = await db.query.users.findFirst({
            where: eq(schema.users.id, pr.authorId),
        });

        const commitMessage = `Apply suggestion from code review\n\nCo-authored-by: ${prAuthor?.username || "reviewer"} <noreply@opencodehub.local>`;
        await workGit.commit(commitMessage);

        // Push to the branch
        await workGit.push("origin", pr.headBranch);

        // Get new commit SHA
        const log = await workGit.log({ n: 1 });
        const newCommitSha = log.latest?.hash || "";

        // Update comment as applied
        await db
            .update(schema.pullRequestComments)
            .set({
                suggestionApplied: true,
                suggestionAppliedById: appliedById,
                suggestionAppliedAt: new Date(),
                suggestionCommitSha: newCommitSha,
                updatedAt: new Date(),
            })
            .where(eq(schema.pullRequestComments.id, commentId));

        // Update PR head SHA
        await db
            .update(schema.pullRequests)
            .set({
                headSha: newCommitSha,
                updatedAt: new Date(),
            })
            .where(eq(schema.pullRequests.id, pr.id));

        // Cleanup temp directory
        await fs.rm(tempPath, { recursive: true, force: true });

        logger.info({ commentId, commitSha: newCommitSha }, "Suggestion applied");
        return { success: true, commitSha: newCommitSha };

    } catch (error) {
        logger.error({ error, commentId }, "Failed to apply suggestion");
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to apply suggestion"
        };
    }
}

/**
 * Batch apply multiple suggestions
 */
export async function batchApplySuggestions(
    commentIds: string[],
    appliedById: string
): Promise<{
    success: boolean;
    applied: string[];
    failed: { id: string; error: string }[];
    commitSha?: string;
}> {
    const applied: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Apply suggestions one by one
    // Note: In a production system, you'd want to batch these into a single commit
    for (const commentId of commentIds) {
        const result = await applySuggestion(commentId, appliedById);
        if (result.success) {
            applied.push(commentId);
        } else {
            failed.push({ id: commentId, error: result.error || "Unknown error" });
        }
    }

    return {
        success: failed.length === 0,
        applied,
        failed,
    };
}

/**
 * Check if user can apply suggestions to a PR
 */
export async function canApplySuggestions(
    userId: string,
    pullRequestId: string
): Promise<boolean> {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, pullRequestId),
        with: {
            repository: true,
        },
    });

    if (!pr) return false;

    // PR author can apply suggestions
    if (pr.authorId === userId) return true;

    // Repository owner can apply
    if (pr.repository?.ownerId === userId) return true;

    // Check if user has write access
    const { canWriteRepo } = await import("./permissions");
    return canWriteRepo(userId, pr.repository!);
}

/**
 * Get pending suggestions for a PR
 */
export async function getPendingSuggestions(pullRequestId: string) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const comments = await db.query.pullRequestComments.findMany({
        where: eq(schema.pullRequestComments.pullRequestId, pullRequestId),
        with: {
            author: true,
        },
    });

    return comments.filter(c => c.suggestionContent && !c.suggestionApplied);
}
