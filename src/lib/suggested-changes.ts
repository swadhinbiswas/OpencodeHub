/**
 * Suggested Changes Library
 * Apply code suggestions from review comments directly
 */

import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import simpleGit from "simple-git";
import path from "path";
import fs from "fs/promises";

const REPOS_BASE_PATH = process.env.REPOS_PATH || path.join(process.cwd(), "data", "repos");

export interface SuggestionApplyResult {
    success: boolean;
    commitSha?: string;
    error?: string;
}

/**
 * Parse suggestion block from comment body
 * Format: ```suggestion\n<code>\n```
 */
export function parseSuggestionFromComment(body: string): string | null {
    const suggestionRegex = /```suggestion\n([\s\S]*?)\n```/;
    const match = body.match(suggestionRegex);
    return match ? match[1] : null;
}

/**
 * Apply a code suggestion from a comment
 */
export async function applySuggestion(
    commentId: string,
    userId: string
): Promise<SuggestionApplyResult> {
    const db = getDatabase();

    const comment = await db.query.pullRequestComments.findFirst({
        where: eq(schema.pullRequestComments.id, commentId),
    });

    if (!comment) {
        return { success: false, error: "Comment not found" };
    }

    if (!comment.suggestionContent && !comment.body) {
        return { success: false, error: "No suggestion content found" };
    }

    if (comment.suggestionApplied) {
        return { success: false, error: "Suggestion already applied" };
    }

    if (!comment.path || !comment.line) {
        return { success: false, error: "Comment must have file path and line number" };
    }

    // Get PR and repo
    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, comment.pullRequestId),
    });

    if (!pr) {
        return { success: false, error: "Pull request not found" };
    }

    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, pr.repositoryId),
    });

    if (!repo) {
        return { success: false, error: "Repository not found" };
    }

    const repoPath = path.join(REPOS_BASE_PATH, repo.diskPath);
    const git = simpleGit(repoPath);

    try {
        // Checkout PR branch
        await git.checkout(pr.headBranch);

        // Get suggestion content
        const suggestion = comment.suggestionContent || parseSuggestionFromComment(comment.body);
        if (!suggestion) {
            return { success: false, error: "Could not parse suggestion" };
        }

        // Read file
        const filePath = path.join(repoPath, comment.path);
        const fileContent = await fs.readFile(filePath, "utf-8");
        const lines = fileContent.split("\n");

        // Apply suggestion
        const startLine = comment.startLine || comment.line;
        const endLine = comment.line;

        const newLines = [
            ...lines.slice(0, startLine - 1),
            suggestion,
            ...lines.slice(endLine),
        ];

        await fs.writeFile(filePath, newLines.join("\n"));

        // Commit changes
        await git.add(comment.path);
        const commitResult = await git.commit(
            `Apply suggestion from code review\n\nCo-authored-by: Reviewer`,
            [comment.path]
        );

        const commitSha = commitResult.commit || "";

        // Update comment
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.pullRequestComments)
            .set({
                suggestionApplied: true,
                suggestionAppliedById: userId,
                suggestionAppliedAt: new Date(),
                suggestionCommitSha: commitSha,
                updatedAt: new Date(),
            })
            .where(eq(schema.pullRequestComments.id, commentId));

        // Update PR head SHA
        const newHead = await git.revparse(["HEAD"]);
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.pullRequests)
            .set({
                headSha: newHead,
                updatedAt: new Date(),
            })
            .where(eq(schema.pullRequests.id, pr.id));

        logger.info({ commentId, commitSha }, "Suggestion applied");

        return { success: true, commitSha };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error({ commentId, error: message }, "Failed to apply suggestion");
        return { success: false, error: message };
    }
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
    originalCode: string;
    suggestedCode: string;
    message?: string;
}): Promise<typeof schema.pullRequestComments.$inferSelect> {
    const db = getDatabase();

    const body = options.message
        ? `${options.message}\n\n\`\`\`suggestion\n${options.suggestedCode}\n\`\`\``
        : `\`\`\`suggestion\n${options.suggestedCode}\n\`\`\``;

    const comment = {
        id: crypto.randomUUID(),
        pullRequestId: options.pullRequestId,
        authorId: options.authorId,
        body,
        path: options.path,
        line: options.line,
        startLine: options.startLine,
        side: "RIGHT" as const,
        suggestionContent: options.suggestedCode,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.pullRequestComments).values(comment);

    return comment as typeof schema.pullRequestComments.$inferSelect;
}

/**
 * Get all pending suggestions for a PR
 */
export async function getPendingSuggestions(prId: string) {
    const db = getDatabase();

    const comments = await db.query.pullRequestComments.findMany({
        where: eq(schema.pullRequestComments.pullRequestId, prId),
    });

    return comments.filter(
        c => c.suggestionContent && !c.suggestionApplied
    );
}

/**
 * Batch apply multiple suggestions
 */
export async function batchApplySuggestions(
    commentIds: string[],
    userId: string
): Promise<{ applied: string[]; failed: { id: string; error: string }[] }> {
    const applied: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const commentId of commentIds) {
        const result = await applySuggestion(commentId, userId);
        if (result.success) {
            applied.push(commentId);
        } else {
            failed.push({ id: commentId, error: result.error || "Unknown error" });
        }
    }

    return { applied, failed };
}
