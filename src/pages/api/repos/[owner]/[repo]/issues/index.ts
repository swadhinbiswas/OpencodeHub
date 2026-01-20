import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  badRequest,
  created,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { canReadRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";
import type { APIRoute } from "astro";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

const createIssueSchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().optional(),
});

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
  const { owner: ownerName, repo: repoName } = params;

  // 1. Authenticate
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized("You must be logged in to create an issue");
  }
  const userId = tokenPayload.userId;

  // 2. Parse body
  const body = await request.json();
  const result = createIssueSchema.safeParse(body);

  if (!result.success) {
    return badRequest("Invalid input", result.error);
  }

  const { title, body: issueBody } = result.data;

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // 3. Get Repository
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName!),
  });

  if (!user) return notFound("Owner not found");

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, user.id),
      eq(schema.repositories.name, repoName!)
    ),
  });

  if (!repo) return notFound("Repository not found");

  // Check permissions
  // Issues can be created by anyone who can read the repository
  const hasPermission = await canReadRepo(userId, repo);
  if (!hasPermission) {
    return notFound("Repository not found");
  }

  // 4. Get next issue number
  // We need to find the max number for this repo
  const lastIssue = await db.query.issues.findFirst({
    where: eq(schema.issues.repositoryId, repo.id),
    orderBy: [desc(schema.issues.number)],
  });

  const nextNumber = (lastIssue?.number || 0) + 1;

  // 5. Create Issue
  const issueId = generateId("issue");
  const now = new Date();

  const newIssue = {
    id: issueId,
    repositoryId: repo.id,
    number: nextNumber,
    title,
    body: issueBody,
    state: "open",
    authorId: userId,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.issues).values(newIssue);

  // Update repository stats
  await db
    .update(schema.repositories)
    .set({ openIssueCount: sql`${schema.repositories.openIssueCount} + 1` })
    .where(eq(schema.repositories.id, repo.id));

  logger.info({ userId, repoId: repo.id, issueNumber: nextNumber }, "Issue created");

  return created({
    ...newIssue,
    url: `/${ownerName}/${repoName}/issues/${nextNumber}`,
  });
});
