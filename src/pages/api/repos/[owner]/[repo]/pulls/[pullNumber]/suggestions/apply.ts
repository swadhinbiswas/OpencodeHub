/**
 * Apply Suggestion API
 * Allows PR authors to apply suggested changes from review comments
 */

import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { parseBody, unauthorized, badRequest, notFound, forbidden, success } from "@/lib/api";
import { applySuggestion, batchApplySuggestions, canApplySuggestions } from "@/lib/suggestions";
import { checkPathPermissions } from "@/lib/path-scoping";
import { z } from "zod";
import { logger } from "@/lib/logger";

const applySchema = z.object({
    commentIds: z.array(z.string()).min(1).max(50),
});

// POST /api/repos/:owner/:repo/pulls/:pullNumber/suggestions/apply
export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
    const user = await getUserFromRequest(request);
    if (!user) {
        return unauthorized();
    }

    const parsed = await parseBody(request, applySchema);
    if ("error" in parsed) return parsed.error;

    const { commentIds } = parsed.data;
    const { owner, repo, pullNumber } = params;

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find repository
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, owner as string),
    });

    if (!repoOwner) {
        return notFound("Repository not found");
    }

    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repo as string)
        ),
    });

    if (!repository) {
        return notFound("Repository not found");
    }

    // Find PR
    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.number, parseInt(pullNumber as string))
        ),
    });

    if (!pr) {
        return notFound("Pull request not found");
    }

    // Check permissions
    const canApply = await canApplySuggestions(user.userId, pr.id);
    if (!canApply) {
        return forbidden("You don't have permission to apply suggestions");
    }

    // Verify all comments belong to this PR
    const comments = await db.query.pullRequestComments.findMany({
        where: eq(schema.pullRequestComments.pullRequestId, pr.id),
    });

    const validCommentIds = new Set(comments.map(c => c.id));
    const invalidIds = commentIds.filter(id => !validCommentIds.has(id));

    if (invalidIds.length > 0) {
        return badRequest(`Invalid comment IDs: ${invalidIds.join(", ")}`);
    }

    const pathScopedComments = comments.filter(c => commentIds.includes(c.id) && !!c.path);
    if (pathScopedComments.length > 0) {
        const scopedPaths = [...new Set(pathScopedComments.map(c => c.path as string))];
        const permission = await checkPathPermissions(user.userId, repository.id, scopedPaths, "write");
        if (!permission.allowed) {
            return forbidden(permission.reason || "Insufficient path permissions to apply these suggestions");
        }
    }

    // Apply suggestions
    if (commentIds.length === 1) {
        const result = await applySuggestion(commentIds[0], user.userId);

        if (!result.success) {
            return badRequest(result.error || "Failed to apply suggestion");
        }

        logger.info({ userId: user.userId, prId: pr.id, commentId: commentIds[0] }, "Applied suggestion");

        return success({
            message: "Suggestion applied",
            commitSha: result.commitSha,
        });
    }

    // Batch apply
    const result = await batchApplySuggestions(commentIds, user.userId);

    logger.info({
        userId: user.userId,
        prId: pr.id,
        applied: result.applied.length,
        failed: result.failed.length
    }, "Batch applied suggestions");

    return success({
        message: `Applied ${result.applied.length} of ${commentIds.length} suggestions`,
        applied: result.applied,
        failed: result.failed,
    });
});
