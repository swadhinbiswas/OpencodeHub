import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { canAdminRepo, canReadRepo } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";

const updateTemplateGovernanceSchema = z.object({
  isTemplate: z.boolean().optional(),
  visibility: z.enum(["public", "private", "internal"]).optional(),
  acknowledgePrivateCatalogRisk: z.boolean().optional(),
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
      eq(schema.repositories.name, repoName)
    ),
  });
}

function describeTemplatePolicy(visibility: "public" | "private" | "internal", isTemplate: boolean) {
  if (!isTemplate) {
    return {
      catalogScope: "disabled",
      policy: "This repository is not currently published as a reusable template.",
    };
  }

  if (visibility === "public") {
    return {
      catalogScope: "public",
      policy: "Visible to all users and available for repository creation.",
    };
  }
  if (visibility === "internal") {
    return {
      catalogScope: "internal",
      policy: "Visible to authenticated users and available for repository creation.",
    };
  }
  return {
    catalogScope: "private-collaborators",
    policy: "Visible only to owner/collaborators with repository access.",
  };
}

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const user = await getUserFromRequest(request);
  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(user?.userId, repository, { isAdmin: user?.isAdmin }))) {
    return notFound("Repository not found");
  }

  const collaborators = await db.query.repositoryCollaborators.findMany({
    where: eq(schema.repositoryCollaborators.repositoryId, repository.id),
    columns: { id: true },
  });

  const templatePolicy = describeTemplatePolicy(
    repository.visibility as "public" | "private" | "internal",
    !!repository.isTemplate
  );

  return success({
    isTemplate: !!repository.isTemplate,
    visibility: repository.visibility,
    isArchived: !!repository.isArchived,
    isMirror: !!repository.isMirror,
    canPublishTemplate: !repository.isArchived && !repository.isMirror,
    templatePolicy,
    governance: {
      requiresPrivateAckForCatalog: true,
      collaboratorCount: collaborators.length,
    },
  });
});

export const PUT: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.userId, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const parsed = await parseBody(request, updateTemplateGovernanceSchema);
  if ("error" in parsed) return parsed.error;

  const { isTemplate, visibility, acknowledgePrivateCatalogRisk } = parsed.data;
  if (isTemplate === undefined && visibility === undefined) {
    return badRequest("At least one template governance field must be provided");
  }

  const nextVisibility = (visibility ?? repository.visibility) as "public" | "private" | "internal";
  const nextIsTemplate = isTemplate ?? !!repository.isTemplate;

  if (nextIsTemplate && repository.isArchived) {
    return badRequest("Archived repositories cannot be published as templates");
  }
  if (nextIsTemplate && repository.isMirror) {
    return badRequest("Mirror repositories cannot be published as templates");
  }
  if (nextIsTemplate && nextVisibility === "private" && !acknowledgePrivateCatalogRisk) {
    return badRequest("Private templates require explicit acknowledgment of collaborator-only visibility");
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (isTemplate !== undefined) updateData.isTemplate = isTemplate;
  if (visibility !== undefined) updateData.visibility = visibility;

  await db
    .update(schema.repositories)
    .set(updateData)
    .where(eq(schema.repositories.id, repository.id));

  const templatePolicy = describeTemplatePolicy(nextVisibility, nextIsTemplate);
  return success({
    updated: true,
    isTemplate: nextIsTemplate,
    visibility: nextVisibility,
    templatePolicy,
  });
});
