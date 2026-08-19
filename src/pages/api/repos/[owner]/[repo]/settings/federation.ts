import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { canAdminRepo } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";

/**
 * GET/POST /api/repos/[owner]/[repo]/settings/federation
 *
 * Read or update the cross-instance federation settings for a repository:
 *  - allowExternalPulls: whether the repo accepts pull requests whose head
 *    lives on a fork hosted by a peer OpenCodeHub instance.
 */
export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  return success({
    allowExternalPulls: repository.allowExternalPulls === true,
    isFork: repository.isFork === true,
    forkedFromUrl: repository.forkedFromUrl || repository.mirrorUrl || null,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.userId, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const parsed = await parseBody(request, z.object({ allowExternalPulls: z.boolean() }));
  if ("error" in parsed) return parsed.error;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  await db
    .update(schema.repositories)
    .set({ allowExternalPulls: parsed.data.allowExternalPulls, updatedAt: new Date() })
    .where(eq(schema.repositories.id, repository.id));

  return success({ allowExternalPulls: parsed.data.allowExternalPulls });
});

async function resolveRepository(owner: string, repoName: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return null;
  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repoName),
    ),
  });
}