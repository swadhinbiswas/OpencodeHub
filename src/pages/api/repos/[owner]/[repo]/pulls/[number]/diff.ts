/**
 * PR Diff API - Get pull request diff
 */
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo, number } = params;
  if (!owner || !repo || !number) return badRequest("Missing parameters");

  const db = getDatabase();
  const tokenPayload = await getUserFromRequest(request);

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return notFound("User not found");

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
  if (!repoData) return notFound("Repository not found");

  const hasAccess = await canReadRepo(tokenPayload?.userId, repoData);
  if (!hasAccess) return notFound("Repository not found");

  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(schema.pullRequests.repositoryId, repoData.id),
      eq(schema.pullRequests.number, parseInt(number)),
    ),
  });
  if (!pr) return notFound("Pull request not found");

  // Generate a unified diff from the source/target branches
  // In a real git backend, this would call git diff
  const diff = [
    `diff --git a/${pr.headBranch}..${pr.baseBranch}`,
    `--- a/${pr.baseBranch}`,
    `+++ b/${pr.headBranch}`,
    `@@ Pull Request #${number}: ${pr.title} @@`,
    `Source: ${pr.headBranch}`,
    `Target: ${pr.baseBranch}`,
    `State: ${pr.state}`,
    ``,
    `// Diff content requires git backend integration`,
    `// This endpoint provides PR metadata for now`,
  ].join("\n");

  return success({
    diff,
    sourceBranch: pr.headBranch,
    targetBranch: pr.baseBranch,
    number: pr.number,
  });
});
