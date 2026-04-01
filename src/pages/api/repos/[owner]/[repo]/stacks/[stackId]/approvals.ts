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
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import {
    canMergeStack,
    getStackApprovalStatus,
    requestStackApproval,
} from "@/lib/stack-approvals";
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

const requestApprovalsSchema = z.object({
  reviewers: z.array(z.string().min(1)).min(1).max(50),
  dryRun: z.boolean().optional(),
});

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
    const { owner: ownerName, repo: repoName, stackId } = params;
    if (!ownerName || !repoName || !stackId)
      return badRequest("Missing parameters");

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
      !(await canReadRepo(actor.id, repo, {
        isAdmin: actor.isAdmin ?? undefined,
      }))
    )
      return notFound("Repository not found");

    const stack = await db.query.prStacks.findFirst({
      where: and(
        eq(schema.prStacks.id, stackId),
        eq(schema.prStacks.repositoryId, repo.id),
      ),
    });

    if (!stack) return notFound("Stack not found");

    const status = await getStackApprovalStatus(stackId);
    if (!status) return notFound("Stack not found");
    const readiness = await canMergeStack(stackId);
    const recommendedReviewers = Array.from(
      new Set(
        status.prs.flatMap((pr) =>
          pr.missingRequiredReviewers
            .map((reviewer) => reviewer.username)
            .filter((username): username is string => Boolean(username)),
        ),
      ),
    );

    return success({
      status,
      canMerge: readiness.canMerge,
      blockers: readiness.blockers,
      recommendedReviewers,
      nextActions: {
        shouldRequestApprovals: !readiness.canMerge,
        pendingPrs: status.summary.pendingPrs,
      },
    });
  },
);

export const POST: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const { owner: ownerName, repo: repoName, stackId } = params;
    if (!ownerName || !repoName || !stackId)
      return badRequest("Missing parameters");

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
    )
      return forbidden();

    const stack = await db.query.prStacks.findFirst({
      where: and(
        eq(schema.prStacks.id, stackId),
        eq(schema.prStacks.repositoryId, repo.id),
      ),
    });

    if (!stack) return notFound("Stack not found");

    const body = await request.json().catch(() => null);
    const parsed = requestApprovalsSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message || "Invalid reviewer payload",
      );
    }
    const reviewers = [...new Set(parsed.data.reviewers)];
    const requestedDuplicates = parsed.data.reviewers.length - reviewers.length;
    const dryRun = parsed.data.dryRun === true;

    const users = await db.query.users.findMany({
      where: inArray(schema.users.username, reviewers),
      columns: { id: true, username: true },
    });

    if (users.length === 0) return badRequest("Reviewers not found");

    const foundUsernames = new Set(users.map((u) => u.username));
    const unresolvedReviewers = reviewers.filter(
      (name) => !foundUsernames.has(name),
    );

    const eligibleUsers: typeof users = [];
    const skipped: string[] = [];
    for (const reviewer of users) {
      const canAccess = await canReadRepo(reviewer.id, repo);
      if (canAccess) {
        eligibleUsers.push(reviewer);
      } else {
        skipped.push(reviewer.username);
      }
    }

    if (eligibleUsers.length === 0) {
      return badRequest("No eligible reviewers with access to this repository");
    }

    const reviewerIds = eligibleUsers.map((u) => u.id);
    let ok = true;
    if (!dryRun) {
      ok = await requestStackApproval(stackId, reviewerIds);
    }

    if (!ok) return badRequest("Failed to request stack approvals");

    return success({
      dryRun,
      requested: eligibleUsers.map((u) => u.username),
      skipped,
      notFound: unresolvedReviewers,
      requestedDuplicates,
    });
  },
);
