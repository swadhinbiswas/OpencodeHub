import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import { canMergeStack, getStackApprovalStatus } from "@/lib/stack-approvals";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

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

    const readiness = await canMergeStack(stackId);
    const approvalStatus = await getStackApprovalStatus(stackId);

    return success({
      stackId,
      canMerge: readiness.canMerge,
      blockers: readiness.blockers,
      approvalStatus,
    });
  },
);
