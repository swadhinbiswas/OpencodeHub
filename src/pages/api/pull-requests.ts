/**
 * Pull Requests API - List pull requests across repos (inbox view)
 */
import { getDatabase, schema } from "@/db";
import { success, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import type { APIRoute } from "astro";
import { desc, eq, or } from "drizzle-orm";

export const GET: APIRoute = withErrorHandler(async ({ request }) => {
  const db = getDatabase();
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload?.userId) return unauthorized("Authentication required");

  const url = new URL(request.url);
  const isInbox = url.searchParams.get("inbox") === "true";
  const limit = parseInt(url.searchParams.get("limit") || "30");

  // Get PRs where user is author, assignee, or reviewer
  const prs = await (db as any)
    .select({
      id: schema.pullRequests.id,
      number: schema.pullRequests.number,
      title: schema.pullRequests.title,
      state: schema.pullRequests.state,
      headBranch: schema.pullRequests.headBranch,
      baseBranch: schema.pullRequests.baseBranch,
      repositoryId: schema.pullRequests.repositoryId,
      authorId: schema.pullRequests.authorId,
      createdAt: schema.pullRequests.createdAt,
      updatedAt: schema.pullRequests.updatedAt,
    })
    .from(schema.pullRequests)
    .where(
      or(
        eq(schema.pullRequests.authorId, tokenPayload.userId),
        // In a full implementation, also check reviewers and assignees tables
      ),
    )
    .orderBy(desc(schema.pullRequests.updatedAt))
    .limit(limit);

  // Map to CLI-friendly format
  const pullRequests = await Promise.all(
    prs.map(async (pr: any) => {
      const author = await db.query.users.findFirst({
        where: eq(schema.users.id, pr.authorId),
      });
      return {
        number: pr.number,
        title: pr.title,
        state: pr.status,
        author: author
          ? { username: author.username }
          : { username: "unknown" },
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
      };
    }),
  );

  return success({ pullRequests });
});
