
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canWriteRepo, canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq, desc } from "drizzle-orm";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, success, forbidden } from "@/lib/api";
import { autoLinkPR } from "@/lib/pr-issue-linking";

// GET: Get PR details
export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName, number } = params;
    const user = locals.user;

    if (!ownerName || !repoName || !number) {
        return badRequest("Missing parameters");
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

    if (!(await canReadRepo(user?.id, repo))) {
        return notFound("Repository not found");
    }

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repo.id),
            eq(schema.pullRequests.number, parseInt(number))
        ),
        with: {
            author: true
        }
    });

    if (!pr) return notFound("Pull request not found");

    return success({ pullRequest: pr });
});

// PATCH: Update PR (title, body, state)
export const PATCH: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName, number } = params;
    const user = locals.user;

    if (!user) return unauthorized();

    if (!ownerName || !repoName || !number) {
        return badRequest("Missing parameters");
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

    if (!(await canWriteRepo(user.id, repo))) {
        return forbidden();
    }

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repo.id),
            eq(schema.pullRequests.number, parseInt(number))
        )
    });

    if (!pr) return notFound("Pull request not found");

    const body = await request.json();
    const { title, body: description, state } = body;

    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.body = description;

    // Handle state change
    let stateChanged = false;
    if (state !== undefined && state !== pr.state) {
        // Check if it's a custom state
        const customState = await db.query.prStateDefinitions.findFirst({
            where: and(
                eq(schema.prStateDefinitions.repositoryId, repo.id),
                eq(schema.prStateDefinitions.name, state)
            )
        });

        if (customState) {
            // Enforce required reviewers
            const requiredReviewers = await db.query.prStateReviewers.findMany({
                where: eq(schema.prStateReviewers.stateDefinitionId, customState.id)
            });

            if (requiredReviewers.length > 0) {
                // Get current reviews
                const reviews = await db.query.pullRequestReviews.findMany({
                    where: eq(schema.pullRequestReviews.pullRequestId, pr.id),
                    orderBy: [desc(schema.pullRequestReviews.submittedAt)]
                });

                // Check each requirement
                for (const req of requiredReviewers) {
                    if (req.userId) {
                        // User requirement
                        const userReview = reviews.find(r => r.reviewerId === req.userId);
                        if (!userReview || userReview.state !== "approved") {
                            // Fetch user details for error message
                            const requiredUser = await db.query.users.findFirst({
                                where: eq(schema.users.id, req.userId)
                            });
                            return badRequest(`Approval required from @${requiredUser?.username || "user"}`);
                        }
                    }
                    // TODO: Handle Team requirements if needed
                }
            }

            updateData.stateId = customState.id;
            updateData.customStateChangedAt = new Date();
            // Custom states are generally 'open' in the high-level sense
            if (pr.state === 'closed') {
                updateData.state = 'open';
                updateData.closedAt = null;
            }
            stateChanged = true;
        } else if (state === "closed") {
            updateData.state = "closed";
            updateData.closedAt = new Date();
            stateChanged = true;
        } else if (state === "open") {
            updateData.state = "open";
            updateData.closedAt = null;
            if (pr.isMerged) {
                return badRequest("Cannot re-open a merged pull request");
            }
            stateChanged = true;
        }
    }

    await db.update(schema.pullRequests)
        .set(updateData)
        .where(eq(schema.pullRequests.id, pr.id));

    if (title !== undefined || description !== undefined) {
        try {
            await autoLinkPR(pr.id, user.id);
        } catch (error) {
            logger.warn({ prId: pr.id, error }, "Failed to auto-link issues for PR update");
        }
    }

    // Trigger automations
    import("@/lib/automations").then(({ triggerAutomation }) => {
        if (stateChanged) {
            if (updateData.state === "closed") {
                triggerAutomation(repo.id, "pr_closed", {
                    pullRequestId: pr.id,
                    userId: user.id
                }).catch(console.error);
            } else if (updateData.state === "open") {
                triggerAutomation(repo.id, "pr_opened", {
                    pullRequestId: pr.id,
                    userId: user.id,
                    metadata: {
                        isReopen: true
                    }
                }).catch(console.error);
            }
        } else {
            // General update
            triggerAutomation(repo.id, "pr_updated", {
                pullRequestId: pr.id,
                userId: user.id,
                metadata: {
                    changes: Object.keys(updateData)
                }
            }).catch(console.error);
        }
    });

    return success({ success: true });
});
