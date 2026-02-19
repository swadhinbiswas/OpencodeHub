import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const number = Number.parseInt(params.number || "", 10);
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repoName || Number.isNaN(number)) {
    return badRequest("Missing or invalid parameters");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return notFound("Repository not found");

  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(user.id, repository, { isAdmin: user.isAdmin }))) {
    return notFound("Repository not found");
  }

  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(schema.pullRequests.repositoryId, repository.id),
      eq(schema.pullRequests.number, number)
    ),
    columns: { id: true, number: true },
  });
  if (!pr) return notFound("Pull request not found");

  const requiredReviewers = await db.query.pullRequestReviewers.findMany({
    where: and(
      eq(schema.pullRequestReviewers.pullRequestId, pr.id),
      eq(schema.pullRequestReviewers.isRequired, true)
    ),
    with: {
      user: {
        columns: { id: true, username: true, displayName: true },
      },
    },
  });

  const allReviews = await db.query.pullRequestReviews.findMany({
    where: eq(schema.pullRequestReviews.pullRequestId, pr.id),
    orderBy: [desc(schema.pullRequestReviews.submittedAt)],
  });
  const latestReviewsByUser = new Map<string, typeof allReviews[number]>();
  for (const review of allReviews) {
    if (!latestReviewsByUser.has(review.reviewerId)) {
      latestReviewsByUser.set(review.reviewerId, review);
    }
  }

  const reviewers = requiredReviewers.map((required) => {
    const latest = latestReviewsByUser.get(required.userId);
    const reviewState = latest?.state || null;
    const approved = reviewState === "approved";
    return {
      userId: required.userId,
      username: required.user?.username || null,
      displayName: required.user?.displayName || null,
      approved,
      reviewState,
      reviewedAt: latest?.submittedAt || latest?.createdAt || null,
    };
  });

  return success({
    pullRequestId: pr.id,
    pullRequestNumber: pr.number,
    totalRequired: reviewers.length,
    approvedRequired: reviewers.filter((reviewer) => reviewer.approved).length,
    missingRequired: reviewers.filter((reviewer) => !reviewer.approved).length,
    reviewers,
  });
});
