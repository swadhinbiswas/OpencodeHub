import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, created, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { canAdminRepo, canReadRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";

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

  const rules = await db.query.reviewerRules.findMany({
    where: eq(schema.reviewerRules.repositoryId, repository.id),
    orderBy: [desc(schema.reviewerRules.createdAt)],
  });

  return success({ rules });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
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
    ruleType,
    targetId,
    count,
    pathPattern,
    isRequired,
    isEnabled,
  } = body || {};

  if (!name || !ruleType) return badRequest("Missing required fields");

  const rule = {
    id: generateId("reviewer_rule"),
    repositoryId: repository.id,
    name,
    ruleType,
    targetId: targetId || null,
    count: typeof count === "number" ? count : null,
    pathPattern: pathPattern || null,
    isRequired: isRequired !== false,
    isEnabled: isEnabled !== false,
    createdById: user.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(schema.reviewerRules).values(rule);

  return created({ rule });
});
