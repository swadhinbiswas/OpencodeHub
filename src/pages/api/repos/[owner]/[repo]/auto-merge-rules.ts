import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, created, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { canAdminRepo, canReadRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";

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

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const { owner, repo } = params;

  if (!owner || !repo) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await getRepository(owner, repo);

  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(locals.user?.id, repository))) {
    return notFound("Repository not found");
  }

  const rules = await db.query.autoMergeRules.findMany({
    where: eq(schema.autoMergeRules.repositoryId, repository.id),
    orderBy: [desc(schema.autoMergeRules.createdAt)],
  });

  return success({ rules });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
  const { owner, repo } = params;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repo) return badRequest("Missing parameters");

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

  if (!name) return badRequest("Missing rule name");

  const rule = {
    id: generateId("auto_merge_rule"),
    repositoryId: repository.id,
    name,
    description: description || null,
    matchLabels: toJsonList(matchLabels),
    requiredLabels: toJsonList(requiredLabels),
    requiredChecks: toJsonList(requiredChecks),
    minApprovals: typeof minApprovals === "number" ? minApprovals : 0,
    requireCodeOwner: !!requireCodeOwner,
    allowDraft: !!allowDraft,
    minTimeInQueueMinutes: typeof minTimeInQueueMinutes === "number" ? minTimeInQueueMinutes : 0,
    mergeMethod: mergeMethod || null,
    isEnabled: isEnabled !== false,
    matchCount: 0,
    lastMatchedAt: null,
    lastMismatchReason: null,
    createdById: user.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(schema.autoMergeRules).values(rule);

  return created({ rule });
});
