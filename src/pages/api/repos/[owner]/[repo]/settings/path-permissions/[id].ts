import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { canAdminRepo } from "@/lib/permissions";

const updatePathPermissionSchema = z.object({
  pathPattern: z.string().min(1).max(500).optional(),
  userId: z.string().min(1).max(128).nullable().optional(),
  teamId: z.string().min(1).max(128).nullable().optional(),
  permission: z.enum(["read", "write", "admin"]).optional(),
  requireApproval: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.userId !== undefined && value.teamId !== undefined) {
    const hasUser = value.userId !== null && value.userId.length > 0;
    const hasTeam = value.teamId !== null && value.teamId.length > 0;
    if (hasUser === hasTeam) {
      ctx.addIssue({
        code: "custom",
        path: ["teamId"],
        message: "When updating assignee target, provide exactly one of userId or teamId",
      });
    }
  }
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

export const PUT: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const id = params.id;
  if (!owner || !repoName || !id) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.userId, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const existing = await db.query.repositoryPathPermissions.findFirst({
    where: and(
      eq(schema.repositoryPathPermissions.id, id),
      eq(schema.repositoryPathPermissions.repositoryId, repository.id)
    ),
  });
  if (!existing) return notFound("Path permission not found");

  const parsed = await parseBody(request, updatePathPermissionSchema);
  if ("error" in parsed) return parsed.error;

  const payload = parsed.data;
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (payload.pathPattern !== undefined) updateData.pathPattern = payload.pathPattern;
  if (payload.permission !== undefined) updateData.permission = payload.permission;
  if (payload.requireApproval !== undefined) updateData.requireApproval = payload.requireApproval ? "true" : "false";

  if (payload.userId !== undefined || payload.teamId !== undefined) {
    updateData.userId = payload.userId ?? null;
    updateData.teamId = payload.teamId ?? null;
  }

  await db.update(schema.repositoryPathPermissions)
    .set(updateData)
    .where(and(
      eq(schema.repositoryPathPermissions.id, id),
      eq(schema.repositoryPathPermissions.repositoryId, repository.id)
    ));

  return success({ updated: true });
});

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

  if (!(await canAdminRepo(user.userId, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const existing = await db.query.repositoryPathPermissions.findFirst({
    where: and(
      eq(schema.repositoryPathPermissions.id, id),
      eq(schema.repositoryPathPermissions.repositoryId, repository.id)
    ),
  });
  if (!existing) return notFound("Path permission not found");

  await db.delete(schema.repositoryPathPermissions)
    .where(and(
      eq(schema.repositoryPathPermissions.id, id),
      eq(schema.repositoryPathPermissions.repositoryId, repository.id)
    ));

  return success({ deleted: true });
});
