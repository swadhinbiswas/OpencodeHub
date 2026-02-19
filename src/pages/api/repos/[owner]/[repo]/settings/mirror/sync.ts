import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo } from "@/lib/permissions";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { syncMirrorRepository } from "@/lib/mirror-sync";

async function resolveRepository(owner: string, repoName: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return null;
  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repoName)
    ),
  });
}

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canWriteRepo(user.userId, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const result = await syncMirrorRepository(repository.id);
  if (!result.success) {
    return badRequest(result.error || "Mirror sync failed");
  }

  return success(result);
});

