import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { compareBranches } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { detectAPIChangesForPullRequest } from "@/lib/dependency-awareness";

async function resolveRepoAndPr(owner: string, repoName: string, number: number) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repoOwner = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!repoOwner) return null;

  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, repoOwner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repository) return null;

  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(schema.pullRequests.repositoryId, repository.id),
      eq(schema.pullRequests.number, number)
    ),
  });
  if (!pr) return null;

  return { repository, pr };
}

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const number = Number(params.number);
  if (!owner || !repoName || Number.isNaN(number)) return badRequest("Invalid route parameters");

  const resolved = await resolveRepoAndPr(owner, repoName, number);
  if (!resolved) return notFound("Pull request not found");

  if (!(await canReadRepo(locals.user?.id, resolved.repository, { isAdmin: locals.user?.isAdmin }))) {
    return notFound("Pull request not found");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const apiChanges = await db.query.apiChangeDetections?.findMany({
    where: eq(schema.apiChangeDetections.pullRequestId, resolved.pr.id),
  }) || [];

  return success({
    total: apiChanges.length,
    breaking: apiChanges.filter((item) => item.breaking).length,
    changes: apiChanges,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const number = Number(params.number);
  if (!owner || !repoName || Number.isNaN(number)) return badRequest("Invalid route parameters");
  if (!locals.user) return unauthorized();

  const resolved = await resolveRepoAndPr(owner, repoName, number);
  if (!resolved) return notFound("Pull request not found");

  if (!(await canWriteRepo(locals.user.id, resolved.repository, { isAdmin: locals.user.isAdmin }))) {
    return forbidden();
  }

  const repoPath = await resolveRepoPath(resolved.repository.diskPath);
  const { diffs } = await compareBranches(repoPath, resolved.pr.baseBranch, resolved.pr.headBranch);
  const changedFiles = diffs.map((d) => d.file).filter(Boolean);

  const changes = await detectAPIChangesForPullRequest(resolved.pr.id, changedFiles);

  return success({
    scannedFiles: changedFiles.length,
    apiSpecFiles: changedFiles.filter((file) => /openapi\.(ya?ml|json)$|swagger\.(ya?ml|json)$|schema\.(graphql|gql)$|\.proto$/i.test(file)),
    total: changes.length,
    breaking: changes.filter((item) => item.breaking).length,
    changes,
  });
});
