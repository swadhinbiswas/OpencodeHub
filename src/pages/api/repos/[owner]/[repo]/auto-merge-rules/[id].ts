import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { canAdminRepo } from "@/lib/permissions";

function toJsonList(value: unknown): string | null {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => String(item).trim()).filter(Boolean));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? JSON.stringify(trimmed.split(",").map((item) => item.trim()).filter(Boolean)) : null;
  }
  return null;
}

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

export const PUT: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
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
  const {
    name,
    description,
    matchLabels,
    requiredLabels,
    requiredChecks,
    minApprovals,
    requireCodeOwner,
    allowDraft,
    minTimeInQueueMinutes,
    mergeMethod,
    isEnabled,
  } = body || {};

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description || null;
  if (matchLabels !== undefined) updateData.matchLabels = toJsonList(matchLabels);
  if (requiredLabels !== undefined) updateData.requiredLabels = toJsonList(requiredLabels);
  if (requiredChecks !== undefined) updateData.requiredChecks = toJsonList(requiredChecks);
  if (minApprovals !== undefined) updateData.minApprovals = Number(minApprovals) || 0;
  if (requireCodeOwner !== undefined) updateData.requireCodeOwner = !!requireCodeOwner;
  if (allowDraft !== undefined) updateData.allowDraft = !!allowDraft;
  if (minTimeInQueueMinutes !== undefined) updateData.minTimeInQueueMinutes = Number(minTimeInQueueMinutes) || 0;
  if (mergeMethod !== undefined) updateData.mergeMethod = mergeMethod || null;
  if (isEnabled !== undefined) updateData.isEnabled = !!isEnabled;

  await db.update(schema.autoMergeRules)
    .set(updateData)
    .where(and(
      eq(schema.autoMergeRules.id, id),
      eq(schema.autoMergeRules.repositoryId, repository.id)
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

  await db.delete(schema.autoMergeRules)
    .where(and(
      eq(schema.autoMergeRules.id, id),
      eq(schema.autoMergeRules.repositoryId, repository.id)
    ));

  return success({ success: true });
});
