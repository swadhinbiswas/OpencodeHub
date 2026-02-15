
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canWriteRepo, canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, success, forbidden } from "@/lib/api";
import { nanoid } from "nanoid";

// POST: Submit a review
export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName, number } = params;
    const user = locals.user;

    if (!user) return unauthorized();

    if (!ownerName || !repoName || !number) {
        return badRequest("Missing parameters");
    }

    const { state, body, commitSha } = await request.json();

    if (!["APPROVED", "CHANGES_REQUESTED", "COMMENTED"].includes(state)) {
        return badRequest("Invalid review state");
    }

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

    // Only write access can approve/request changes?
    // Usually anyone with read access can comment, but approvals might require write access depending on rules.
    // For now, let's allow anyone with read access to review, but maybe distinguish later.
    // GitHub allows read-access users to review.

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

    const reviewId = nanoid();
    await db.insert(schema.pullRequestReviews).values({
        id: reviewId,
        pullRequestId: pr.id,
        reviewerId: user.id,
        state,
        body,
        commitSha,
        submittedAt: new Date()
    });

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

    return success({ id: reviewId, state });
});
