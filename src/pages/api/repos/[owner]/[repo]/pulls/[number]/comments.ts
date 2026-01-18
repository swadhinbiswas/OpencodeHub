/**
 * PR Comments API
 * Inline diff comments with GitHub-style code suggestions
 */

import type { APIRoute } from "astro";
import { eq, and, desc, isNull } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { parseBody, unauthorized, badRequest, notFound, success, serverError } from "@/lib/api";
import { z } from "zod";
import crypto from "crypto";

const createCommentSchema = z.object({
    body: z.string().min(1),
    path: z.string().optional(), // For inline comments
    line: z.number().int().positive().optional(),
    side: z.enum(["LEFT", "RIGHT"]).optional(),
    startLine: z.number().int().positive().optional(),
    commitSha: z.string().optional(),
    inReplyToId: z.string().optional(), // For threading
    suggestedChange: z.string().optional(), // Code suggestion
});

const updateCommentSchema = z.object({
    body: z.string().min(1),
});

// GET /api/repos/:owner/:repo/pulls/:number/comments - List comments
export const GET: APIRoute = async ({ params, request }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const { owner, repo, number } = params;
        const db = getDatabase();

        // Find PR
        const pr = await db.query.pullRequests.findFirst({
            where: and(
                eq(schema.pullRequests.number, parseInt(number as string)),
            ),
            with: { repository: true },
        });

        if (!pr || pr.repository?.ownerId !== owner) {
            return notFound("Pull request not found");
        }

        // Get comments
        const comments = await db.query.pullRequestComments.findMany({
            where: eq(schema.pullRequestComments.pullRequestId, pr.id),
            with: {
                author: true,
            },
            orderBy: [desc(schema.pullRequestComments.createdAt)],
        });

        // Organize into threads
        const commentMap = new Map();
        const threads: any[] = [];

        comments.forEach(comment => {
            commentMap.set(comment.id, { ...comment, replies: [] });
        });

        comments.forEach(comment => {
            const commentWithReplies = commentMap.get(comment.id);
            if (comment.inReplyToId) {
                const parent = commentMap.get(comment.inReplyToId);
                if (parent) {
                    parent.replies.push(commentWithReplies);
                }
            } else {
                threads.push(commentWithReplies);
            }
        });

        return success({ comments: threads });
    } catch (error) {
        console.error("Get comments error:", error);
        return serverError("Failed to get comments");
    }
};

// POST /api/repos/:owner/:repo/pulls/:number/comments - Create comment
export const POST: APIRoute = async ({ params, request }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const parsed = await parseBody(request, createCommentSchema);
        if ("error" in parsed) return parsed.error;

        const { owner, repo, number } = params;
        const db = getDatabase();

        // Find PR
        const pr = await db.query.pullRequests.findFirst({
            where: and(
                eq(schema.pullRequests.number, parseInt(number as string)),
            ),
            with: { repository: true },
        });

        if (!pr || pr.repository?.ownerId !== owner) {
            return notFound("Pull request not found");
        }

        const now = new Date().toISOString();
        const commentId = `comment_${crypto.randomBytes(8).toString("hex")}`;

        // Check for code suggestion
        let body = parsed.data.body;
        if (parsed.data.suggestedChange) {
            // Format as GitHub-style suggestion
            body += `\n\n\`\`\`suggestion\n${parsed.data.suggestedChange}\n\`\`\``;
        }

        // Create comment
        await db.insert(schema.pullRequestComments).values({
            id: commentId,
            pullRequestId: pr.id,
            authorId: tokenPayload.userId,
            body,
            path: parsed.data.path,
            line: parsed.data.line,
            side: parsed.data.side || "RIGHT",
            startLine: parsed.data.startLine,
            commitSha: parsed.data.commitSha,
            inReplyToId: parsed.data.inReplyToId,
            createdAt: now,
            updatedAt: now,
        });

        const comment = await db.query.pullRequestComments.findFirst({
            where: eq(schema.pullRequestComments.id, commentId),
            with: { author: true },
        });

        return success({ comment, message: "Comment created" });
    } catch (error) {
        console.error("Create comment error:", error);
        return serverError("Failed to create comment");
    }
};

// PATCH /api/repos/:owner/:repo/pulls/:number/comments/:commentId - Update comment
export const PATCH: APIRoute = async ({ params, request }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const parsed = await parseBody(request, updateCommentSchema);
        if ("error" in parsed) return parsed.error;

        const { owner, repo, number, commentId } = params;
        const db = getDatabase();

        // Find comment
        const comment = await db.query.pullRequestComments.findFirst({
            where: eq(schema.pullRequestComments.id, commentId as string),
            with: {
                pullRequest: {
                    with: { repository: true },
                },
            },
        });

        if (!comment || comment.pullRequest?.repository?.ownerId !== owner) {
            return notFound("Comment not found");
        }

        // Check ownership
        if (comment.authorId !== tokenPayload.userId) {
            return unauthorized("Not your comment");
        }

        // Update
        await db
            .update(schema.pullRequestComments)
            .set({
                body: parsed.data.body,
                isEdited: true,
                editedAt: new Date().toISOString(),
            })
            .where(eq(schema.pullRequestComments.id, commentId as string));

        return success({ message: "Comment updated" });
    } catch (error) {
        console.error("Update comment error:", error);
        return serverError("Failed to update comment");
    }
};

// DELETE /api/repos/:owner/:repo/pulls/:number/comments/:commentId - Delete comment
export const DELETE: APIRoute = async ({ params, request }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const { owner, repo, number, commentId } = params;
        const db = getDatabase();

        // Find comment
        const comment = await db.query.pullRequestComments.findFirst({
            where: eq(schema.pullRequestComments.id, commentId as string),
            with: {
                pullRequest: {
                    with: { repository: true },
                },
            },
        });

        if (!comment || comment.pullRequest?.repository?.ownerId !== owner) {
            return notFound("Comment not found");
        }

        // Check ownership
        if (comment.authorId !== tokenPayload.userId && !tokenPayload.isAdmin) {
            return unauthorized("Not authorized");
        }

        // Delete
        await db.delete(schema.pullRequestComments).where(eq(schema.pullRequestComments.id, commentId as string));

        return success({ message: "Comment deleted" });
    } catch (error) {
        console.error("Delete comment error:", error);
        return serverError("Failed to delete comment");
    }
};
