import { getDatabase, schema } from "@/db";
import {
  badRequest,
  forbidden,
  notFound,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canWriteRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

const reviewerRoutingSchema = z
  .object({
    prIds: z.array(z.string().min(1)).min(1).max(100),
    reviewerIds: z.array(z.string().min(1)).max(20).optional().default([]),
    assigneeIds: z.array(z.string().min(1)).max(20).optional().default([]),
    reviewerMode: z
      .enum(["requested", "required"])
      .optional()
      .default("required"),
  })
  .refine(
    (value) => value.reviewerIds.length > 0 || value.assigneeIds.length > 0,
    "Provide at least one reviewer or assignee",
  );

async function resolveActor(
  db: NodePgDatabase<typeof schema>,
  request: Request,
  localUser: { id: string; isAdmin?: boolean | null } | null | undefined,
) {
  if (localUser?.id) {
    return localUser;
  }

  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return null;
  }

  return db.query.users.findFirst({
    where: eq(schema.users.id, tokenPayload.userId),
    columns: { id: true, isAdmin: true },
  });
}

export const GET: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const { owner: ownerName, repo: repoName } = params;
    if (!ownerName || !repoName) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const actor = await resolveActor(db, request, locals.user);
    if (!actor) return unauthorized();

    const owner = await db.query.users.findFirst({
      where: eq(schema.users.username, ownerName),
    });
    if (!owner) return notFound("Repository not found");

    const repo = await db.query.repositories.findFirst({
      where: and(
        eq(schema.repositories.ownerId, owner.id),
        eq(schema.repositories.name, repoName),
      ),
      with: {
        owner: {
          columns: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
    if (!repo) return notFound("Repository not found");

    if (
      !(await canWriteRepo(actor.id, repo, {
        isAdmin: actor.isAdmin ?? undefined,
      }))
    ) {
      return forbidden();
    }

    const [openPullRequests, collaborators] = await Promise.all([
      db.query.pullRequests.findMany({
        where: and(
          eq(schema.pullRequests.repositoryId, repo.id),
          eq(schema.pullRequests.state, "open"),
        ),
        columns: { id: true },
      }),
      db.query.repositoryCollaborators.findMany({
        where: eq(schema.repositoryCollaborators.repositoryId, repo.id),
        with: { user: true },
      }),
    ]);

    const openPrIds = openPullRequests.map((pr) => pr.id);
    const reviewerRequests = openPrIds.length
      ? await db.query.pullRequestReviewers.findMany({
          where: inArray(schema.pullRequestReviewers.pullRequestId, openPrIds),
          columns: { pullRequestId: true, userId: true },
        })
      : [];

    const pendingReviewLoadByUser = reviewerRequests.reduce(
      (acc, item) => {
        acc[item.userId] = (acc[item.userId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const candidateMap = new Map<
      string,
      {
        id: string;
        username: string;
        displayName: string | null;
        avatarUrl: string | null;
        role: string;
      }
    >();

    candidateMap.set(repo.owner.id, {
      id: repo.owner.id,
      username: repo.owner.username,
      displayName: repo.owner.displayName || null,
      avatarUrl: repo.owner.avatarUrl || null,
      role: "owner",
    });

    for (const collaborator of collaborators) {
      if (!collaborator.user) continue;
      candidateMap.set(collaborator.userId, {
        id: collaborator.user.id,
        username: collaborator.user.username,
        displayName: collaborator.user.displayName || null,
        avatarUrl: collaborator.user.avatarUrl || null,
        role: collaborator.role,
      });
    }

    const candidates = Array.from(candidateMap.values())
      .map((candidate) => ({
        ...candidate,
        pendingReviewCount: pendingReviewLoadByUser[candidate.id] || 0,
      }))
      .sort((left, right) => {
        if (left.pendingReviewCount !== right.pendingReviewCount) {
          return left.pendingReviewCount - right.pendingReviewCount;
        }

        return left.username.localeCompare(right.username);
      });

    return success({ candidates });
  },
);

export const POST: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const { owner: ownerName, repo: repoName } = params;
    if (!ownerName || !repoName) return badRequest("Missing parameters");

    const body = await request.json().catch(() => null);
    const parsed = reviewerRoutingSchema.safeParse(body || {});
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message || "Invalid reviewer routing payload",
      );
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const actor = await resolveActor(db, request, locals.user);
    if (!actor) return unauthorized();

    const owner = await db.query.users.findFirst({
      where: eq(schema.users.username, ownerName),
    });
    if (!owner) return notFound("Repository not found");

    const repo = await db.query.repositories.findFirst({
      where: and(
        eq(schema.repositories.ownerId, owner.id),
        eq(schema.repositories.name, repoName),
      ),
    });
    if (!repo) return notFound("Repository not found");
    if (
      !(await canWriteRepo(actor.id, repo, {
        isAdmin: actor.isAdmin ?? undefined,
      }))
    ) {
      return forbidden();
    }

    const uniquePrIds = [...new Set(parsed.data.prIds)];
    const pullRequests = await db.query.pullRequests.findMany({
      where: and(
        eq(schema.pullRequests.repositoryId, repo.id),
        inArray(schema.pullRequests.id, uniquePrIds),
      ),
      columns: {
        id: true,
        number: true,
        state: true,
        authorId: true,
      },
    });

    if (pullRequests.length !== uniquePrIds.length) {
      return badRequest("Some pull requests do not belong to this repository");
    }

    const closedPr = pullRequests.find((pr) => pr.state !== "open");
    if (closedPr) {
      return badRequest(
        `Only open pull requests can be routed from this surface (#${closedPr.number})`,
      );
    }

    const candidateUserIds = [
      ...new Set([...parsed.data.reviewerIds, ...parsed.data.assigneeIds]),
    ];
    const collaboratorRows = await db.query.repositoryCollaborators.findMany({
      where: eq(schema.repositoryCollaborators.repositoryId, repo.id),
      columns: { userId: true },
    });
    const allowedUserIds = new Set<string>([
      repo.ownerId,
      ...collaboratorRows.map((row) => row.userId),
    ]);

    const invalidUserId = candidateUserIds.find(
      (id) => !allowedUserIds.has(id),
    );
    if (invalidUserId) {
      return badRequest(
        "Reviewer routing only supports repository owners and collaborators",
      );
    }

    const existingReviewers = await db.query.pullRequestReviewers.findMany({
      where: inArray(schema.pullRequestReviewers.pullRequestId, uniquePrIds),
      columns: { pullRequestId: true, userId: true },
    });
    const existingAssignees = await db.query.pullRequestAssignees.findMany({
      where: inArray(schema.pullRequestAssignees.pullRequestId, uniquePrIds),
      columns: { pullRequestId: true, userId: true },
    });

    const reviewerKeys = new Set(
      existingReviewers.map(
        (entry) => `${entry.pullRequestId}:${entry.userId}`,
      ),
    );
    const assigneeKeys = new Set(
      existingAssignees.map(
        (entry) => `${entry.pullRequestId}:${entry.userId}`,
      ),
    );

    let reviewersAdded = 0;
    let reviewersSkipped = 0;
    let reviewerAuthorConflicts = 0;
    let assigneesAdded = 0;
    let assigneesSkipped = 0;

    for (const pr of pullRequests) {
      for (const reviewerId of parsed.data.reviewerIds) {
        if (reviewerId === pr.authorId) {
          reviewerAuthorConflicts += 1;
          continue;
        }

        const key = `${pr.id}:${reviewerId}`;
        if (reviewerKeys.has(key)) {
          reviewersSkipped += 1;
          continue;
        }

        await db.insert(schema.pullRequestReviewers).values({
          id: generateId(),
          pullRequestId: pr.id,
          userId: reviewerId,
          isRequired: parsed.data.reviewerMode === "required",
          requestedAt: new Date(),
        });
        reviewerKeys.add(key);
        reviewersAdded += 1;
      }

      for (const assigneeId of parsed.data.assigneeIds) {
        const key = `${pr.id}:${assigneeId}`;
        if (assigneeKeys.has(key)) {
          assigneesSkipped += 1;
          continue;
        }

        await db.insert(schema.pullRequestAssignees).values({
          id: generateId(),
          pullRequestId: pr.id,
          userId: assigneeId,
          assignedAt: new Date(),
        });
        assigneeKeys.add(key);
        assigneesAdded += 1;
      }
    }

    return success({
      routedPrCount: pullRequests.length,
      summary: {
        reviewersAdded,
        reviewersSkipped,
        reviewerAuthorConflicts,
        assigneesAdded,
        assigneesSkipped,
        reviewerMode: parsed.data.reviewerMode,
      },
    });
  },
);
