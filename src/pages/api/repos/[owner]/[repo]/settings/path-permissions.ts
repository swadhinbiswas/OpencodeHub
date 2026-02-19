import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, created, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { canAdminRepo, canReadRepo } from "@/lib/permissions";
import { getPathPermissions } from "@/lib/path-scoping";

const createPathPermissionSchema = z.object({
  pathPattern: z.string().min(1).max(500),
  userId: z.string().min(1).max(128).optional(),
  teamId: z.string().min(1).max(128).optional(),
  permission: z.enum(["read", "write", "admin"]),
  requireApproval: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (!value.userId && !value.teamId) {
    ctx.addIssue({
      code: "custom",
      path: ["userId"],
      message: "Either userId or teamId is required",
    });
  }
  if (value.userId && value.teamId) {
    ctx.addIssue({
      code: "custom",
      path: ["teamId"],
      message: "Provide only one of userId or teamId",
    });
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

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(user?.userId, repository, { isAdmin: user?.isAdmin }))) {
    return notFound("Repository not found");
  }

  const rules = await getPathPermissions(repository.id);

  return success({
    rules,
    summary: {
      totalRules: rules.length,
      requireApprovalRules: rules.filter((rule) => rule.requireApproval === "true").length,
    },
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
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

  const parsed = await parseBody(request, createPathPermissionSchema);
  if ("error" in parsed) return parsed.error;

  const payload = parsed.data;
  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(schema.repositoryPathPermissions).values({
    id,
    repositoryId: repository.id,
    pathPattern: payload.pathPattern,
    userId: payload.userId ?? null,
    teamId: payload.teamId ?? null,
    permission: payload.permission,
    requireApproval: payload.requireApproval ? "true" : "false",
    createdAt: now,
    updatedAt: now,
  });

  return created({
    id,
    repositoryId: repository.id,
    pathPattern: payload.pathPattern,
    userId: payload.userId ?? null,
    teamId: payload.teamId ?? null,
    permission: payload.permission,
    requireApproval: payload.requireApproval ? "true" : "false",
  });
});
