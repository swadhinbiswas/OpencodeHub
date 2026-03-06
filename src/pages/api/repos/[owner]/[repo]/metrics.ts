/**
 * Repository Metrics API - Get metrics for a repository
 */
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, count, eq, gte, sql } from "drizzle-orm";

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) return badRequest("Owner and repo required");

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

  const url = new URL(request.url);
  const weeks = parseInt(url.searchParams.get("weeks") || "4");
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

  // Count stars
  const starsResult = await (db as any)
    .select({ count: count() })
    .from(schema.repositoryStars)
    .where(eq(schema.repositoryStars.repositoryId, repoData.id));

  // Count forks
  const forksResult = await (db as any)
    .select({ count: count() })
    .from(schema.repositories)
    .where(eq(schema.repositories.forkedFromId, repoData.id));

  // Count open PRs
  const openPrsResult = await (db as any)
    .select({ count: count() })
    .from(schema.pullRequests)
    .where(
      and(
        eq(schema.pullRequests.repositoryId, repoData.id),
        eq(schema.pullRequests.state, "open"),
      ),
    );

  // Count open issues
  const openIssuesResult = await (db as any)
    .select({ count: count() })
    .from(schema.issues)
    .where(
      and(
        eq(schema.issues.repositoryId, repoData.id),
        eq(schema.issues.state, "open"),
      ),
    );

  // Count recent PRs (merged in period)
  const mergedPrsResult = await (db as any)
    .select({ count: count() })
    .from(schema.pullRequests)
    .where(
      and(
        eq(schema.pullRequests.repositoryId, repoData.id),
        eq(schema.pullRequests.state, "merged"),
        gte(schema.pullRequests.mergedAt, since),
      ),
    );

  // Count contributors (distinct PR authors)
  const contributorsResult = await (db as any)
    .select({ count: sql`COUNT(DISTINCT ${schema.pullRequests.authorId})` })
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.repositoryId, repoData.id));

  const metrics = {
    stars: starsResult[0]?.count || 0,
    forks: forksResult[0]?.count || 0,
    openPrs: openPrsResult[0]?.count || 0,
    openIssues: openIssuesResult[0]?.count || 0,
    mergedPrs: mergedPrsResult[0]?.count || 0,
    contributors: Number(contributorsResult[0]?.count) || 0,
    recentCommits: 0, // Would require git backend integration
  };

  return success({ metrics });
});
