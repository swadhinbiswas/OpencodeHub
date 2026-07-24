/**
 * User Metrics by Username API - Get metrics for a specific user
 */
import { getDatabase, schema } from "@/db";
import { notFound, success, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import type { APIRoute } from "astro";
import { count, eq, sql } from "drizzle-orm";

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { username } = params;
  if (!username) return notFound("Username required");

  const db = getDatabase();
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload?.userId) return unauthorized("Authentication required");

  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, username),
  });
  if (!user) return notFound("User not found");

  const url = new URL(request.url);

  // PRs authored
  const totalAuthored = await (db as any)
    .select({ count: count() })
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.authorId, user.id));

  const mergedAuthored = await (db as any)
    .select({ count: count() })
    .from(schema.pullRequests)
    .where(
      sql`${schema.pullRequests.authorId} = ${user.id} AND ${schema.pullRequests.state} = 'merged'`,
    );

  // Reviews given
  const totalReviews = await (db as any)
    .select({ count: count() })
    .from(schema.pullRequestReviews)
    .where(eq(schema.pullRequestReviews.reviewerId, user.id));

  const approvals = await (db as any)
    .select({ count: count() })
    .from(schema.pullRequestReviews)
    .where(
      sql`${schema.pullRequestReviews.reviewerId} = ${user.id} AND ${schema.pullRequestReviews.state} = 'approved'`,
    );

  const changesRequested = await (db as any)
    .select({ count: count() })
    .from(schema.pullRequestReviews)
    .where(
      sql`${schema.pullRequestReviews.reviewerId} = ${user.id} AND ${schema.pullRequestReviews.state} = 'changes_requested'`,
    );

  return success({
    authored: {
      total: totalAuthored[0]?.count || 0,
      merged: mergedAuthored[0]?.count || 0,
      avgTimeToMerge: 0, // Would need complex calculation
    },
    reviewed: {
      total: totalReviews[0]?.count || 0,
      approvals: approvals[0]?.count || 0,
      changesRequested: changesRequested[0]?.count || 0,
    },
    trends: [], // Would need weekly aggregation
  });
});
