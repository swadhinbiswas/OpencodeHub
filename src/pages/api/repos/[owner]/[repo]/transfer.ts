import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, forbidden } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canAdminRepo, getOrgPermission } from "@/lib/permissions";

/**
 * WS3-05: transfer a repository to an organization.
 * POST /api/repos/{owner}/{repo}/transfer  { orgName: string }
 * Only the repo admin (or site admin) can transfer; the caller must be
 * an owner/admin of the target org.
 */
export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { owner, repo } = params;
  if (!owner || !repo) return badRequest("Missing parameters");

  const body = await request.json().catch(() => null);
  const orgName = body?.orgName;
  if (!orgName) return badRequest("orgName is required");

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Resolve the repo
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return notFound("Repository not found");
  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
  if (!repository) return notFound("Repository not found");

  // Only admins of the repo can transfer
  if (!(await canAdminRepo(user.userId, repository, { isAdmin: user.isAdmin ?? undefined }))) {
    return forbidden("Only repository admins can transfer it");
  }

  // Resolve the target org
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, orgName),
  });
  if (!organization) return notFound("Organization not found");

  // Caller must be owner/admin of the target org
  const orgPermission = await getOrgPermission(user.userId, organization.id, {
    isAdmin: user.isAdmin,
  });
  if (orgPermission !== "owner" && orgPermission !== "admin") {
    return forbidden("You must be an owner or admin of the target organization");
  }

  // Cannot transfer a repo already owned by the org
  if (repository.ownerType === "organization" && repository.ownerId === organization.id) {
    return badRequest("Repository is already owned by this organization");
  }

  // Transfer: repoint owner to the org
  await db
    .update(schema.repositories)
    .set({ ownerId: organization.id, ownerType: "organization", updatedAt: new Date() })
    .where(eq(schema.repositories.id, repository.id));

  // Make the caller the initial admin collaborator on the repo
  const existingCollab = await db.query.repositoryCollaborators.findFirst({
    where: and(
      eq(schema.repositoryCollaborators.repositoryId, repository.id),
      eq(schema.repositoryCollaborators.userId, user.userId),
    ),
  });
  if (!existingCollab) {
    await db.insert(schema.repositoryCollaborators).values({
      id: crypto.randomUUID(),
      repositoryId: repository.id,
      userId: user.userId,
      role: "owner",
      createdAt: new Date(),
    });
  }

  logger.info(
    { userId: user.userId, repoId: repository.id, orgId: organization.id },
    "Repository transferred to organization",
  );

  return success({
    message: "Repository transferred",
    url: `/${orgName}/${repo}`,
  });
});
