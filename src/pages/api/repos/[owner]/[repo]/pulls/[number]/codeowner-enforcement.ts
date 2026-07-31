import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import { resolveRepoPath } from "@/lib/git-storage";
import { compareBranches } from "@/lib/git";
import { checkCodeOwnerApprovals, getCodeOwnersSummary } from "@/lib/codeowners-enforcement";

function branchRuleMatches(pattern: string, branch: string): boolean {
  if (pattern === branch) return true;
  if (pattern.endsWith("*")) return branch.startsWith(pattern.slice(0, -1));
  return false;
}

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
    columns: { id: true, number: true, baseBranch: true, headBranch: true, stateId: true },
  });
  if (!pr) return notFound("Pull request not found");

  const [reviewRequirements, protectionRules] = await Promise.all([
    db.query.reviewRequirements.findFirst({
      where: eq(schema.reviewRequirements.repositoryId, repository.id),
      columns: { requireCodeOwner: true },
    }),
    db.query.branchProtection.findMany({
      where: and(
        eq(schema.branchProtection.repositoryId, repository.id),
        eq(schema.branchProtection.active, true)
      ),
      columns: {
        id: true,
        pattern: true,
        requireCodeOwnerReviews: true,
      },
    }),
  ]);

  let requiredByPRState = false;
  if (pr.stateId) {
    const prState = await db.query.prStateDefinitions.findFirst({
        where: eq(schema.prStateDefinitions.id, pr.stateId),
        columns: { requireCodeOwner: true }
    });
    requiredByPRState = !!prState?.requireCodeOwner;
  }

  const matchingRule =
    protectionRules.find((rule) => branchRuleMatches(rule.pattern, pr.baseBranch)) || null;
  const requiredByReviewPolicy = !!reviewRequirements?.requireCodeOwner;
  const requiredByBranchRule = !!matchingRule?.requireCodeOwnerReviews;
  const enforced = requiredByReviewPolicy || requiredByBranchRule || requiredByPRState;

  const repoPath = await resolveRepoPath(repository.diskPath);
  const comparison = await compareBranches(repoPath, pr.baseBranch, pr.headBranch);
  const changedFiles = comparison.diffs.map((diff) => diff.file).filter(Boolean);

  if (!enforced) {
    return success({
      pullRequestId: pr.id,
      pullRequestNumber: pr.number,
      baseBranch: pr.baseBranch,
      headBranch: pr.headBranch,
      enforced: false,
      blockers: [],
      changedFiles,
      requiredBy: {
        reviewPolicy: false,
        branchRule: false,
        prState: false,
      },
      activeRule: matchingRule
        ? {
            id: matchingRule.id,
            pattern: matchingRule.pattern,
            requireCodeOwnerReviews: !!matchingRule.requireCodeOwnerReviews,
          }
        : null,
      files: [],
    });
  }

  const [approvalCheck, summary] = await Promise.all([
    checkCodeOwnerApprovals(repository.id, pr.id, changedFiles),
    getCodeOwnersSummary(repository.id, changedFiles),
  ]);

  const blockers =
    approvalCheck.missingApprovals?.map(
      (item) => `Missing Code Owner approval for ${item.path} (${item.requiredOwners.join(", ")})`
    ) || [];

  return success({
    pullRequestId: pr.id,
    pullRequestNumber: pr.number,
    baseBranch: pr.baseBranch,
    headBranch: pr.headBranch,
    enforced: true,
    ready: approvalCheck.canMerge,
    blockers,
    changedFiles,
    requiredBy: {
      reviewPolicy: requiredByReviewPolicy,
      branchRule: requiredByBranchRule,
      prState: requiredByPRState,
    },
    activeRule: matchingRule
      ? {
          id: matchingRule.id,
          pattern: matchingRule.pattern,
          requireCodeOwnerReviews: !!matchingRule.requireCodeOwnerReviews,
        }
      : null,
    files: summary.map((file) => {
      const missing = approvalCheck.missingApprovals.find((entry) => entry.path === file.path);
      return {
        path: file.path,
        owners: file.owners,
        approved: !missing,
        requiredOwners: missing?.requiredOwners || [],
        approvedBy: missing?.approvedBy || [],
      };
    }),
  });
});
