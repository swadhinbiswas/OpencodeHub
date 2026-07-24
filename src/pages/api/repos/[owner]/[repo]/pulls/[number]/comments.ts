/**
 * PR Comments API
 * Inline diff comments with GitHub-style code suggestions
 */

import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, desc } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { parseBody, unauthorized, badRequest, notFound, success, forbidden } from "@/lib/api";
import { z } from "zod";
import crypto from "crypto";
import { checkPathPermissions } from "@/lib/path-scoping";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";

const createCommentSchema = z.object({
    body: z.string().min(1),
    path: z.string().optional(), // For inline comments
    line: z.number().int().positive().optional(),
    side: z.enum(["LEFT", "RIGHT"]).optional(),
    startLine: z.number().int().positive().optional(),
    commitSha: z.string().optional(),
    inReplyToId: z.string().optional(), // For threading
    suggestedChange: z.string().optional(), // Code suggestion (legacy or alternative)
    suggestionContent: z.string().optional(),
});

const updateCommentSchema = z.object({
    body: z.string().min(1),
});

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

async function getRepositoryByOwnerAndName(
    db: NodePgDatabase<typeof schema>,
    owner: string,
    repo: string
) {
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, owner),
    });
    if (!repoOwner) return null;

    return db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repo)
        ),
    });
}

// GET /api/repos/:owner/:repo/pulls/:number/comments - List comments
export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const { owner, repo, number } = params;
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepositoryByOwnerAndName(db, owner as string, repo as string);
    if (!repository) return notFound("Repository not found");
    if (!(await canReadRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin }))) {
        return notFound("Repository not found");
    }

    // Find PR
    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.number, parseInt(number as string)),
        ),
        with: { repository: true },
    });

    if (!pr) {
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

    const scopedPaths = [...new Set(
        comments
            .map((comment) => comment.path)
            .filter((path): path is string => Boolean(path))
    )];
    const deniedPaths = new Set<string>();
    if (scopedPaths.length > 0) {
        const permission = await checkPathPermissions(
            tokenPayload.userId,
            pr.repositoryId,
            scopedPaths,
            "read"
        );
        for (const path of permission.deniedPaths || []) {
            deniedPaths.add(path);
        }
    }

    const visibleComments = comments.filter((comment) => !comment.path || !deniedPaths.has(comment.path));

    // Organize into threads
    const commentMap = new Map();
    const threads: any[] = [];

    visibleComments.forEach(comment => {
        commentMap.set(comment.id, { ...comment, replies: [] });
    });

    visibleComments.forEach(comment => {
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

    return success({ comments: threads, hiddenCount: comments.length - visibleComments.length });
});

// POST /api/repos/:owner/:repo/pulls/:number/comments - Create comment
export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const parsed = await parseBody(request, createCommentSchema);
    if ("error" in parsed) return parsed.error;

    const { owner, repo, number } = params;
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepositoryByOwnerAndName(db, owner as string, repo as string);
    if (!repository) return notFound("Repository not found");
    if (!(await canWriteRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin }))) {
        return forbidden();
    }

    // Find PR
    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.number, parseInt(number as string)),
        ),
        with: { repository: true },
    });

    if (!pr) {
        return notFound("Pull request not found");
    }

    if (parsed.data.path) {
        const permission = await checkPathPermissions(
            tokenPayload.userId,
            pr.repositoryId,
            [parsed.data.path],
            "write"
        );
        if (!permission.allowed) {
            return forbidden(permission.reason || "Insufficient path permissions for this comment");
        }
    }

    const now = new Date();
    const commentId = `comment_${crypto.randomBytes(8).toString("hex")}`;

    // Check for code suggestion
    let body = parsed.data.body;
    let suggestionContent = parsed.data.suggestionContent || parsed.data.suggestedChange;
    
    if (parsed.data.suggestedChange && !body.includes("```suggestion")) {
        // Format as GitHub-style suggestion if not already in body
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
        suggestionContent: suggestionContent,
        createdAt: now,
        updatedAt: now,
    });

    const comment = await db.query.pullRequestComments.findFirst({
        where: eq(schema.pullRequestComments.id, commentId),
        with: { author: true },
    });

    logger.info({ userId: tokenPayload.userId, repoId: pr.repository.id, prId: pr.id, commentId }, "PR comment created");

    return success({ comment, message: "Comment created" });
});

// PATCH /api/repos/:owner/:repo/pulls/:number/comments/:commentId - Update comment
export const PATCH: APIRoute = withErrorHandler(async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const parsed = await parseBody(request, updateCommentSchema);
    if ("error" in parsed) return parsed.error;

    const { owner, repo, commentId: commentIdFromParams } = params;
    const requestUrl = new URL(request.url);
    const commentId = (commentIdFromParams as string | undefined) || requestUrl.searchParams.get("commentId");
    if (!commentId) return badRequest("commentId is required");
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepositoryByOwnerAndName(db, owner as string, repo as string);
    if (!repository) return notFound("Repository not found");
    if (!(await canWriteRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin }))) {
        return forbidden();
    }

    // Find comment
    const comment = await db.query.pullRequestComments.findFirst({
        where: eq(schema.pullRequestComments.id, commentId as string),
        with: {
            pullRequest: {
                with: { repository: true },
            },
        },
    });

    if (!comment || comment.pullRequest?.repositoryId !== repository.id) {
        return notFound("Comment not found");
    }

    // Check ownership
    if (comment.authorId !== tokenPayload.userId) {
        return unauthorized("Not your comment");
    }

    if (comment.path) {
        const permission = await checkPathPermissions(
            tokenPayload.userId,
            comment.pullRequest.repositoryId,
            [comment.path],
            "write"
        );
        if (!permission.allowed) {
            return forbidden(permission.reason || "Insufficient path permissions for this comment");
        }
    }

    // Update
    await db
        .update(schema.pullRequestComments)
        .set({
            body: parsed.data.body,
            isEdited: true,
            editedAt: new Date(),
        })
        .where(eq(schema.pullRequestComments.id, commentId as string));

    logger.info({ userId: tokenPayload.userId, commentId }, "PR comment updated");

    return success({ message: "Comment updated" });
});

// DELETE /api/repos/:owner/:repo/pulls/:number/comments/:commentId - Delete comment
export const DELETE: APIRoute = withErrorHandler(async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const { owner, repo, commentId: commentIdFromParams } = params;
    const requestUrl = new URL(request.url);
    const commentId = (commentIdFromParams as string | undefined) || requestUrl.searchParams.get("commentId");
    if (!commentId) return badRequest("commentId is required");
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepositoryByOwnerAndName(db, owner as string, repo as string);
    if (!repository) return notFound("Repository not found");
    if (!(await canWriteRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin }))) {
        return forbidden();
    }

    // Find comment
    const comment = await db.query.pullRequestComments.findFirst({
        where: eq(schema.pullRequestComments.id, commentId as string),
        with: {
            pullRequest: {
                with: { repository: true },
            },
        },
    });

    if (!comment || comment.pullRequest?.repositoryId !== repository.id) {
        return notFound("Comment not found");
    }

    // Check ownership
    if (comment.authorId !== tokenPayload.userId && !tokenPayload.isAdmin) {
        return unauthorized("Not authorized");
    }

    if (comment.path && !tokenPayload.isAdmin) {
        const permission = await checkPathPermissions(
            tokenPayload.userId,
            comment.pullRequest.repositoryId,
            [comment.path],
            "write"
        );
        if (!permission.allowed) {
            return forbidden(permission.reason || "Insufficient path permissions for this comment");
        }
    }

    // Delete
    await db.delete(schema.pullRequestComments).where(eq(schema.pullRequestComments.id, commentId as string));

    logger.info({ userId: tokenPayload.userId, commentId }, "PR comment deleted");

    return success({ message: "Comment deleted" });
});
