
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canWriteRepo, canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, success, forbidden, parseBody } from "@/lib/api";
import { nanoid } from "nanoid";
import { z } from "zod";
import { checkPathPermissions } from "@/lib/path-scoping";
import crypto from "crypto";

const reviewSchema = z.object({
    state: z.enum(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]),
    body: z.string().max(10000).optional(),
    commitSha: z.string().optional(),
    comments: z
        .array(
            z.object({
                body: z.string().min(1).max(20000),
                path: z.string().optional(),
                line: z.number().int().positive().optional(),
                side: z.enum(["LEFT", "RIGHT"]).optional(),
                startLine: z.number().int().positive().optional(),
                commitSha: z.string().optional(),
                inReplyToId: z.string().optional(),
                suggestedChange: z.string().optional(),
            })
        )
        .max(100)
        .optional(),
});

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName, number } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!ownerName || !repoName || !number) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName),
    });
    if (!repoOwner) return notFound("Repository not found");

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repoName)
        ),
    });
    if (!repo) return notFound("Repository not found");
    if (!(await canReadRepo(user.id, repo, { isAdmin: user.isAdmin }))) return notFound("Repository not found");

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repo.id),
            eq(schema.pullRequests.number, parseInt(number))
        )
    });
    if (!pr) return notFound("Pull request not found");

    const reviews = await db.query.pullRequestReviews.findMany({
        where: eq(schema.pullRequestReviews.pullRequestId, pr.id),
        with: {
            reviewer: {
                columns: {
                    id: true,
                    username: true,
                    displayName: true,
                },
            },
            comments: {
                with: {
                    author: {
                        columns: {
                            id: true,
                            username: true,
                            displayName: true,
                        },
                    },
                },
            },
        },
    });

    const scopedPaths = Array.from(
        new Set(
            reviews
                .flatMap((review) => review.comments || [])
                .map((comment) => comment.path)
                .filter((path): path is string => Boolean(path))
        )
    );
    const deniedPaths = new Set<string>();
    if (scopedPaths.length > 0) {
        const permission = await checkPathPermissions(user.id, repo.id, scopedPaths, "read");
        for (const path of permission.deniedPaths || []) deniedPaths.add(path);
    }

    let hiddenCommentCount = 0;
    const filteredReviews = reviews.map((review) => {
        const comments = (review.comments || []).filter((comment) => {
            if (!comment.path) return true;
            const visible = !deniedPaths.has(comment.path);
            if (!visible) hiddenCommentCount += 1;
            return visible;
        });
        return {
            ...review,
            comments,
        };
    });

    return success({ reviews: filteredReviews, hiddenCommentCount });
});

// POST: Submit a review
export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName, number } = params;
    const user = locals.user;

    if (!user) return unauthorized();

    if (!ownerName || !repoName || !number) {
        return badRequest("Missing parameters");
    }

    const parsed = await parseBody(request, reviewSchema);
    if ("error" in parsed) return parsed.error;
    const { state, body, commitSha, comments = [] } = parsed.data;

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName),
    });

    if (!repoOwner) return notFound("Repository not found");

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repoName)
        ),
    });

    if (!repo) return notFound("Repository not found");

    if (!(await canReadRepo(user.id, repo))) {
        return notFound("Repository not found");
    }

    if (state !== "COMMENTED" && !(await canWriteRepo(user.id, repo))) {
        return forbidden("Write access required to approve or request changes");
    }

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repo.id),
            eq(schema.pullRequests.number, parseInt(number))
        )
    });

    if (!pr) return notFound("Pull request not found");

    if (pr.authorId === user.id && state !== "COMMENTED") {
        return badRequest("Authors cannot approve or request changes on their own PR");
    }

    const scopedPaths = Array.from(
        new Set(
            comments
                .map((comment) => comment.path?.trim())
                .filter((path): path is string => Boolean(path))
        )
    );
    if (scopedPaths.length > 0) {
        const permission = await checkPathPermissions(user.id, repo.id, scopedPaths, "write");
        if (!permission.allowed) {
            return forbidden(permission.reason || "Insufficient path permissions for one or more review comments");
        }
    }

    const now = new Date();
    const reviewId = nanoid();
    await db.insert(schema.pullRequestReviews).values({
        id: reviewId,
        pullRequestId: pr.id,
        reviewerId: user.id,
        state,
        body: body || "Review submitted",
        commitSha,
        submittedAt: now
    });

    for (const commentInput of comments) {
        let commentBody = commentInput.body;
        if (commentInput.suggestedChange) {
            commentBody += `\n\n\`\`\`suggestion\n${commentInput.suggestedChange}\n\`\`\``;
        }
        const commentId = `comment_${crypto.randomBytes(8).toString("hex")}`;
        await db.insert(schema.pullRequestComments).values({
            id: commentId,
            pullRequestId: pr.id,
            reviewId,
            authorId: user.id,
            body: commentBody,
            path: commentInput.path ?? null,
            line: commentInput.line ?? null,
            side: commentInput.side || "RIGHT",
            startLine: commentInput.startLine ?? null,
            commitSha: commentInput.commitSha || commitSha || null,
            inReplyToId: commentInput.inReplyToId ?? null,
            createdAt: now,
            updatedAt: now,
        });
    }

    // Trigger automation
    import("@/lib/automations").then(({ triggerAutomation }) => {
        let triggerEvent: "pr_approved" | "pr_changes_requested" | "comment_added" | null = null;
        if (state === "APPROVED") triggerEvent = "pr_approved";
        else if (state === "CHANGES_REQUESTED") triggerEvent = "pr_changes_requested";
        // 'COMMENTED' might trigger 'comment_added' but that's usually for single comments.
        // A review is a collection of comments or a summary.
        // Let's assume review submission counts as a comment added if it has a body.

        if (triggerEvent) {
            triggerAutomation(repo.id, triggerEvent, {
                pullRequestId: pr.id,
                userId: user.id,
                metadata: {
                    reviewId,
                    body
                }
            }).catch(console.error);
        }
    });

    logger.info({ userId: user.id, prId: pr.id, reviewId, state }, "PR review submitted");

    return success({ id: reviewId, state, commentCount: comments.length });
});
