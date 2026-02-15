import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { canAdminRepo } from "@/lib/permissions";

async function getRepository(owner: string, repo: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });

  if (!ownerUser) return null;

  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo)
    ),
  });
}

export const PUT: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const { owner, repo, id } = params;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repo || !id) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await getRepository(owner, repo);

  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.id, repository))) {
    return forbidden();
  }

  const body = await request.json();
  const { name, ruleType, targetId, count, pathPattern, isRequired, isEnabled } = body || {};

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (name !== undefined) updateData.name = name;
  if (ruleType !== undefined) updateData.ruleType = ruleType;
  if (targetId !== undefined) updateData.targetId = targetId || null;
  if (count !== undefined) updateData.count = Number(count) || null;
  if (pathPattern !== undefined) updateData.pathPattern = pathPattern || null;
  if (isRequired !== undefined) updateData.isRequired = !!isRequired;
  if (isEnabled !== undefined) updateData.isEnabled = !!isEnabled;

  await db.update(schema.reviewerRules)
    .set(updateData)
    .where(and(
      eq(schema.reviewerRules.id, id),
      eq(schema.reviewerRules.repositoryId, repository.id)
    ));

  return success({ success: true });
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const { owner, repo, id } = params;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repo || !id) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await getRepository(owner, repo);

  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.id, repository))) {
    return forbidden();
  }

  await db.delete(schema.reviewerRules)
    .where(and(
      eq(schema.reviewerRules.id, id),
      eq(schema.reviewerRules.repositoryId, repository.id)
    ));

  return success({ success: true });
});
