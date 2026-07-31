import crypto from "crypto";
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canWriteRepo, canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { unauthorized, badRequest, notFound, success, forbidden } from "@/lib/api";
import { autoLinkPR } from "@/lib/pr-issue-linking";
import { canMerge } from "@/lib/merge-queue";

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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
        return badRequest("Invalid request body");
    }
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
            // Note: Enforcing required reviewers and code owners for a custom state
            // is now handled by `canMerge` in `merge-queue.ts`. Transitioning INTO
            // the state is allowed so that the reviewers can actually review it while in the state.

            if (customState.allowMerge) {
                const readiness = await canMerge(pr.id);
                if (!readiness.canMerge) {
                    return badRequest(readiness.reason || "Merge requirements not met");
                }
            }

            // ENFORCE PER-STATE REQUIRED REVIEWERS
            const requiredReviewers = await db.query.prStateReviewers.findMany({
                where: eq(schema.prStateReviewers.stateDefinitionId, customState.id)
            });

            if (requiredReviewers.length > 0) {
                const userIdsToRequest = new Set<string>();

                for (const rr of requiredReviewers) {
                    if (rr.userId) {
                        userIdsToRequest.add(rr.userId);
                    } else if (rr.teamId) {
                        const teamMembers = await db.query.teamMembers.findMany({
                            where: eq(schema.teamMembers.teamId, rr.teamId)
                        });
                        for (const member of teamMembers) {
                            userIdsToRequest.add(member.userId);
                        }
                    }
                }

                // Exclude author
                userIdsToRequest.delete(pr.authorId);

                // Filter out already requested reviewers
                const existingReviewers = await db.query.pullRequestReviewers.findMany({
                    where: eq(schema.pullRequestReviewers.pullRequestId, pr.id)
                });
                for (const ex of existingReviewers) {
                    userIdsToRequest.delete(ex.userId);
                }

                // Insert missing
                if (userIdsToRequest.size > 0) {
                    const newReviewers = Array.from(userIdsToRequest).map(uid => ({
                        id: crypto.randomUUID(),
                        pullRequestId: pr.id,
                        userId: uid,
                        isRequired: true,
                    }));
                    await db.insert(schema.pullRequestReviewers).values(newReviewers);
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
            updateData.closedById = user.id;
            updateData.stateId = null;
            updateData.customStateChangedAt = new Date();
            stateChanged = true;
        } else if (state === "open") {
            updateData.state = "open";
            updateData.closedAt = null;
            updateData.closedById = null;
            updateData.stateId = null;
            updateData.customStateChangedAt = new Date();
            if (pr.isMerged) {
                return badRequest("Cannot re-open a merged pull request");
            }
            stateChanged = true;
        } else {
            return badRequest("Invalid pull request state");
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

    // Trigger automations (best effort, but awaited to avoid leaked async operations)
    try {
        const { triggerAutomation } = await import("@/lib/automations");
        if (stateChanged) {
            if (updateData.state === "closed") {
                await triggerAutomation(repo.id, "pr_closed", {
                    pullRequestId: pr.id,
                    userId: user.id
                });
            } else if (updateData.state === "open") {
                await triggerAutomation(repo.id, "pr_opened", {
                    pullRequestId: pr.id,
                    userId: user.id,
                    metadata: {
                        isReopen: true
                    }
                });
            }
        } else {
            await triggerAutomation(repo.id, "pr_updated", {
                pullRequestId: pr.id,
                userId: user.id,
                metadata: {
                    changes: Object.keys(updateData)
                }
            });
        }
    } catch (error) {
        logger.warn({ prId: pr.id, error }, "Failed to trigger PR automations");
    }

    return success({ success: true });
});
