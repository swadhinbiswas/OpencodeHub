import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo } from "@/lib/permissions";
import { deleteCustomField } from "@/lib/custom-fields";

async function resolveRepository(owner: string, repoName: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repoOwner = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!repoOwner) return null;

  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, repoOwner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
}

export const DELETE: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const id = params.id;
  if (!owner || !repoName || !id) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canWriteRepo(user.userId, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const field = await db.query.customFieldDefinitions.findFirst({
    where: and(
      eq(schema.customFieldDefinitions.id, id),
      eq(schema.customFieldDefinitions.repositoryId, repository.id)
    ),
  });
  if (!field) return notFound("Field not found");

  const ok = await deleteCustomField(id);
  if (!ok) return badRequest("Failed to delete field");
  return success({ deleted: true });
});
