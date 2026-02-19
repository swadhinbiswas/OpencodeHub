import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";

export const GET: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
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
    columns: { id: true, number: true, stateId: true },
  });
  if (!pr) return notFound("Pull request not found");

  const requestUrl = new URL(request.url);
  const targetStateId = requestUrl.searchParams.get("stateId");
  const targetStateName = requestUrl.searchParams.get("state");
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

  if (targetStateId || targetStateName) {
    const stateDefinition = await db.query.prStateDefinitions.findFirst({
      where: targetStateId
        ? and(
            eq(schema.prStateDefinitions.repositoryId, repository.id),
            eq(schema.prStateDefinitions.id, targetStateId)
          )
        : and(
            eq(schema.prStateDefinitions.repositoryId, repository.id),
            eq(schema.prStateDefinitions.name, targetStateName!)
          ),
      columns: {
        id: true,
        name: true,
        displayName: true,
      },
    });
    if (!stateDefinition) return notFound("State definition not found");

    const stateReviewers = await db.query.prStateReviewers.findMany({
      where: eq(schema.prStateReviewers.stateDefinitionId, stateDefinition.id),
      with: {
        user: {
          columns: { id: true, username: true, displayName: true },
        },
        team: {
          columns: { id: true, name: true },
        },
      },
    });

    const userRules = stateReviewers.filter((reviewer) => reviewer.userId);
    const teamRules = stateReviewers.filter((reviewer) => reviewer.teamId);

    const reviewers = userRules.map((required) => {
      const latest = latestReviewsByUser.get(required.userId!);
      const reviewState = latest?.state || null;
      const approved = reviewState === "approved";
      return {
        userId: required.userId!,
        username: required.user?.username || null,
        displayName: required.user?.displayName || null,
        approved,
        reviewState,
        reviewedAt: latest?.submittedAt || latest?.createdAt || null,
        source: "state_policy",
      };
    });

    const teamRequirements = [];
    for (const rule of teamRules) {
      const members = await db.query.teamMembers.findMany({
        where: eq(schema.teamMembers.teamId, rule.teamId!),
        columns: { userId: true },
      });
      const requiredCount = Math.max(1, rule.requiredCount ?? 1);
      const approvedCount = members.filter((member) => {
        const latest = latestReviewsByUser.get(member.userId);
        return latest?.state === "approved";
      }).length;
      const missingCount = Math.max(requiredCount - approvedCount, 0);

      teamRequirements.push({
        teamId: rule.teamId!,
        teamName: rule.team?.name || null,
        requiredCount,
        approvedCount,
        missingCount,
      });
    }

    const teamRequiredTotal = teamRequirements.reduce((total, rule) => total + rule.requiredCount, 0);
    const teamApprovedTotal = teamRequirements.reduce(
      (total, rule) => total + Math.min(rule.requiredCount, rule.approvedCount),
      0
    );
    const approvedUsers = reviewers.filter((reviewer) => reviewer.approved).length;
    const totalRequired = reviewers.length + teamRequiredTotal;
    const approvedRequired = approvedUsers + teamApprovedTotal;
    const missingRequired = Math.max(totalRequired - approvedRequired, 0);

    return success({
      pullRequestId: pr.id,
      pullRequestNumber: pr.number,
      targetState: {
        id: stateDefinition.id,
        name: stateDefinition.name,
        displayName: stateDefinition.displayName,
      },
      totalRequired,
      approvedRequired,
      missingRequired,
      reviewers,
      teamRequirements,
      policySource: "state",
    });
  }

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
    teamRequirements: [],
    policySource: "assigned",
  });
});
