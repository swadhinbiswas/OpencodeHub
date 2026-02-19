import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { canReadRepo } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { canMergeStack, getStackApprovalStatus } from "@/lib/stack-approvals";

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const { owner: ownerName, repo: repoName, stackId } = params;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!ownerName || !repoName || !stackId) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const owner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!owner) return notFound("Repository not found");

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, owner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repo) return notFound("Repository not found");
  if (!(await canReadRepo(user.id, repo))) return notFound("Repository not found");

  const stack = await db.query.prStacks.findFirst({
    where: and(
      eq(schema.prStacks.id, stackId),
      eq(schema.prStacks.repositoryId, repo.id)
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
});

