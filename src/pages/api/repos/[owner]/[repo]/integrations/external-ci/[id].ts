import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo } from "@/lib/permissions";
import { getAirGappedMessage, isAirGappedMode } from "@/lib/air-gapped";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  baseUrl: z.string().url().optional(),
  apiToken: z.string().min(1).optional(),
  projectId: z.string().min(1).max(300).optional(),
  isEnabled: z.boolean().optional(),
  syncStatus: z.boolean().optional(),
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
  return {
    ...config,
    apiToken: undefined,
  };
}

export const PATCH: APIRoute = withErrorHandler(async ({ params, request }) => {
  if (isAirGappedMode()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "AIR_GAPPED_MODE", message: getAirGappedMessage("External CI integrations") },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const owner = params.owner;
  const repoName = params.repo;
  const id = params.id;
  if (!owner || !repoName || !id) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canWriteRepo(user.userId, repository, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
    return forbidden();
  }

  const config = await db.query.externalCIConfigs.findFirst({
    where: and(
      eq(schema.externalCIConfigs.id, id),
      eq(schema.externalCIConfigs.repositoryId, repository.id)
    ),
  });
  if (!config) return notFound("External CI config not found");

  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.baseUrl !== undefined) updates.baseUrl = parsed.data.baseUrl;
  if (parsed.data.apiToken !== undefined) updates.apiToken = parsed.data.apiToken;
  if (parsed.data.projectId !== undefined) updates.projectId = parsed.data.projectId;
  if (parsed.data.isEnabled !== undefined) updates.isEnabled = parsed.data.isEnabled;
  if (parsed.data.syncStatus !== undefined) updates.syncStatus = parsed.data.syncStatus;

  await db.update(schema.externalCIConfigs)
    .set(updates)
    .where(eq(schema.externalCIConfigs.id, id));

  const updated = await db.query.externalCIConfigs.findFirst({
    where: eq(schema.externalCIConfigs.id, id),
  });

  return success(updated ? redactConfig(updated) : null);
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, request }) => {
  if (isAirGappedMode()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "AIR_GAPPED_MODE", message: getAirGappedMessage("External CI integrations") },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const owner = params.owner;
  const repoName = params.repo;
  const id = params.id;
  if (!owner || !repoName || !id) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canWriteRepo(user.userId, repository, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
    return forbidden();
  }

  const config = await db.query.externalCIConfigs.findFirst({
    where: and(
      eq(schema.externalCIConfigs.id, id),
      eq(schema.externalCIConfigs.repositoryId, repository.id)
    ),
  });
  if (!config) return notFound("External CI config not found");

  await db.delete(schema.externalCIConfigs).where(eq(schema.externalCIConfigs.id, id));

  return success({ deleted: true });
});
