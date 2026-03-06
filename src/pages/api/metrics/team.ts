/**
 * Team Metrics API - Get team/leaderboard metrics
 */
import { getDatabase, schema } from "@/db";
import { success, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import type { APIRoute } from "astro";
import { count, desc, eq, gte, sql } from "drizzle-orm";

export const GET: APIRoute = withErrorHandler(async ({ request }) => {
  const db = getDatabase();
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload?.userId) return unauthorized("Authentication required");

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "4w";
  const limit = parseInt(url.searchParams.get("limit") || "10");
  const repositoryId = url.searchParams.get("repositoryId");

  // Calculate time window
  const weeks =
    period === "1w" ? 1 : period === "3m" ? 12 : period === "1y" ? 52 : 4;
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

  // Get top contributors by PR count
  const prConditions = [gte(schema.pullRequests.createdAt, since)];
  if (repositoryId) {
    prConditions.push(eq(schema.pullRequests.repositoryId, repositoryId));
  }

  const topAuthors = await (db as any)
    .select({
      userId: schema.pullRequests.authorId,
      prs: count(),
    })
    .from(schema.pullRequests)
    .where(sql`${schema.pullRequests.createdAt} >= ${since}`)
    .groupBy(schema.pullRequests.authorId)
    .orderBy(desc(count()))
    .limit(limit);

  // Enrich with usernames and review counts
  const contributors = await Promise.all(
    topAuthors.map(async (author: any) => {
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, author.userId),
      });

      // Count reviews given by this user
      const reviewsResult = await (db as any)
        .select({ count: count() })
        .from(schema.pullRequestReviews)
        .where(eq(schema.pullRequestReviews.reviewerId, author.userId));

      return {
        username: user?.username || "unknown",
        prs: author.prs,
        reviews: reviewsResult[0]?.count || 0,
      };
    }),
  );

  // Overall metrics
  const totalPrs = await (db as any)
    .select({ count: count() })
    .from(schema.pullRequests)
    .where(sql`${schema.pullRequests.createdAt} >= ${since}`);

  const mergedPrs = await (db as any)
    .select({ count: count() })
    .from(schema.pullRequests)
    .where(
      sql`${schema.pullRequests.createdAt} >= ${since} AND ${schema.pullRequests.state} = 'merged'`,
    );

  const openPrs = await (db as any)
    .select({ count: count() })
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.state, "open"));

  return success({
    contributors,
    metrics: {
      totalPrs: totalPrs[0]?.count || 0,
      mergedPrs: mergedPrs[0]?.count || 0,
      openPrs: openPrs[0]?.count || 0,
    },
  });
});
