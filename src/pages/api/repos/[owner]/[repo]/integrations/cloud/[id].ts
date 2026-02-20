import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo } from "@/lib/permissions";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  region: z.string().min(1).max(120).optional(),
  credentials: z.record(z.string()).optional(),
  settings: z.record(z.any()).optional(),
  isEnabled: z.boolean().optional(),
});

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

function redactConfig(config: any) {
  const credentialKeys = Object.keys((config?.credentials || {}) as Record<string, unknown>);
  return {
    ...config,
    credentials: undefined,
    hasCredentials: credentialKeys.length > 0,
    credentialKeys,
  };
}

export const PATCH: APIRoute = withErrorHandler(async ({ params, request }) => {
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

  const config = await db.query.cloudConfigs.findFirst({
    where: and(
      eq(schema.cloudConfigs.id, id),
      eq(schema.cloudConfigs.repositoryId, repository.id)
    ),
  });
  if (!config) return notFound("Cloud config not found");

  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.region !== undefined) updates.region = parsed.data.region;
  if (parsed.data.credentials !== undefined) updates.credentials = parsed.data.credentials;
  if (parsed.data.settings !== undefined) updates.settings = parsed.data.settings;
  if (parsed.data.isEnabled !== undefined) updates.isEnabled = parsed.data.isEnabled;

  await db.update(schema.cloudConfigs)
    .set(updates)
    .where(eq(schema.cloudConfigs.id, id));

  const updated = await db.query.cloudConfigs.findFirst({
    where: eq(schema.cloudConfigs.id, id),
  });

  return success(updated ? redactConfig(updated) : null);
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

  if (!(await canWriteRepo(user.userId, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const config = await db.query.cloudConfigs.findFirst({
    where: and(
      eq(schema.cloudConfigs.id, id),
      eq(schema.cloudConfigs.repositoryId, repository.id)
    ),
  });
  if (!config) return notFound("Cloud config not found");

  await db.delete(schema.cloudConfigs).where(eq(schema.cloudConfigs.id, id));

  return success({ deleted: true });
});
