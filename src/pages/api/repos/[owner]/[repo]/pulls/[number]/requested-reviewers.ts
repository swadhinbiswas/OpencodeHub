import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { getUserFromRequest, getRepoAndUser } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, serverError } from "@/lib/api";
import { pullRequestReviewers } from "@/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";

// GET: list requested reviewers
export const GET: APIRoute = async ({ request, params }) => {
  try {
    const { owner, repo, number } = params;
    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const repoData = await getRepoAndUser(request, owner, repo);
    if (!repoData) return notFound("Repository not found");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const pr = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.repositoryId, repoData.repository.id),
        eq(schema.pullRequests.number, parseInt(number)),
      ),
      with: { reviewers: { with: { user: true } } },
    });
    if (!pr) return notFound("Pull request not found");

    return success({ reviewers: pr.reviewers.map((r) => r.user) });
  } catch (error) {
    logger.error({ err: error }, "Failed to list PR reviewers");
    return serverError("Failed to list PR reviewers");
  }
};

// POST: request reviews from users { userIds: string[] }
export const POST: APIRoute = async ({ request, params }) => {
  try {
    const { owner, repo, number } = params;
    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const repoData = await getRepoAndUser(request, owner, repo);
    if (!repoData) return notFound("Repository not found");
    if (repoData.permission === "read") return unauthorized("Write access required");

    const body = await request.json();
    const { userIds } = body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return badRequest("userIds must be a non-empty array");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const pr = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.repositoryId, repoData.repository.id),
        eq(schema.pullRequests.number, parseInt(number)),
      ),
    });
    if (!pr) return notFound("Pull request not found");

    // Verify users exist and exclude the author
    const valid: string[] = [];
    for (const id of userIds) {
      const u = await db.query.users.findFirst({
        where: eq(schema.users.id, id),
        columns: { id: true },
      });
      if (u && u.id !== pr.authorId) valid.push(id);
    }

    const existing = await db.query.pullRequestReviewers.findMany({
      where: and(
        eq(pullRequestReviewers.pullRequestId, pr.id),
        inArray(pullRequestReviewers.userId, valid),
      ),
      columns: { userId: true },
    });
    const existingIds = new Set(existing.map((e) => e.userId));
    const toAdd = valid.filter((id) => !existingIds.has(id));

    if (toAdd.length > 0) {
      await db.insert(pullRequestReviewers).values(
        toAdd.map((userId) => ({
          id: generateId(),
          pullRequestId: pr.id,
          userId,
          requestedAt: new Date(),
        })),
      );
    }

    // Notify the requested reviewers + send emails
    const now = new Date();
    for (const reviewerId of toAdd) {
      await db.insert(schema.notifications).values({
        id: generateId(),
        userId: reviewerId,
        repositoryId: repoData.repository.id,
        type: "review_request",
        title: `Review requested on PR #${number}`,
        body: `You were requested to review ${owner}/${repo}#${number}`,
        url: `/${owner}/${repo}/pulls/${number}`,
        actorId: user.userId,
        subjectType: "pull_request",
        subjectId: pr.id,
        reason: "review_requested",
        isRead: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Email the reviewers
    const reviewers = await db.query.users.findMany({
      where: inArray(schema.users.id, toAdd),
      columns: { id: true, email: true, username: true },
    });
    for (const reviewer of reviewers) {
      if (!reviewer.email) continue;
      import("@/lib/email").then(({ sendPullRequestEmail }) => {
        sendPullRequestEmail(reviewer.email!, "review_requested", {
          title: pr.title,
          number: parseInt(number),
          url: `/${owner}/${repo}/pulls/${number}`,
          repository: { name: repo, owner: { username: owner } },
          author: { username: user.username },
        }).catch((err) => logger.error({ err }, "Review request email failed"));
      });
    }

    const updated = await db.query.pullRequests.findFirst({
      where: eq(schema.pullRequests.id, pr.id),
      with: { reviewers: { with: { user: true } } },
    });

    return success({
      reviewers: (updated?.reviewers ?? []).map((r) => r.user),
      requested: toAdd,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to request reviews");
    return serverError("Failed to request reviews");
  }
};

// DELETE: remove a review request { userIds: string[] }
export const DELETE: APIRoute = async ({ request, params }) => {
  try {
    const { owner, repo, number } = params;
    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const user = await getUserFromRequest(request);
    if (!user) return unauthorized();

    const repoData = await getRepoAndUser(request, owner, repo);
    if (!repoData) return notFound("Repository not found");
    if (repoData.permission === "read") return unauthorized("Write access required");

    const body = await request.json();
    const { userIds } = body;
    if (!Array.isArray(userIds)) return badRequest("userIds must be an array");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const pr = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.repositoryId, repoData.repository.id),
        eq(schema.pullRequests.number, parseInt(number)),
      ),
    });
    if (!pr) return notFound("Pull request not found");

    await db
      .delete(pullRequestReviewers)
      .where(
        and(
          eq(pullRequestReviewers.pullRequestId, pr.id),
          inArray(pullRequestReviewers.userId, userIds),
        ),
      );

    return success({ removed: userIds });
  } catch (error) {
    logger.error({ err: error }, "Failed to remove review requests");
    return serverError("Failed to remove review requests");
  }
};
