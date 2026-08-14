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
  apiUrl: z.string().url().optional(),
  apiToken: z.string().min(1).optional(),
  projectKey: z.string().min(1).max(200).optional(),
  isEnabled: z.boolean().optional(),
  syncToExternal: z.boolean().optional(),
  syncFromExternal: z.boolean().optional(),
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
        error: { code: "AIR_GAPPED_MODE", message: getAirGappedMessage("Issue tracker integrations") },
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

  const config = await db.query.issueTrackerConfigs.findFirst({
    where: and(
      eq(schema.issueTrackerConfigs.id, id),
      eq(schema.issueTrackerConfigs.repositoryId, repository.id)
    ),
  });
  if (!config) return notFound("Issue tracker config not found");

  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.apiUrl !== undefined) updates.apiUrl = parsed.data.apiUrl;
  if (parsed.data.apiToken !== undefined) updates.apiToken = parsed.data.apiToken;
  if (parsed.data.projectKey !== undefined) updates.projectKey = parsed.data.projectKey;
  if (parsed.data.isEnabled !== undefined) updates.isEnabled = parsed.data.isEnabled;
  if (parsed.data.syncToExternal !== undefined) updates.syncToExternal = parsed.data.syncToExternal;
  if (parsed.data.syncFromExternal !== undefined) updates.syncFromExternal = parsed.data.syncFromExternal;

  await db.update(schema.issueTrackerConfigs)
    .set(updates)
    .where(eq(schema.issueTrackerConfigs.id, id));

  const updated = await db.query.issueTrackerConfigs.findFirst({
    where: eq(schema.issueTrackerConfigs.id, id),
  });

  return success(updated ? redactConfig(updated) : null);
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, request }) => {
  if (isAirGappedMode()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "AIR_GAPPED_MODE", message: getAirGappedMessage("Issue tracker integrations") },
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

  const config = await db.query.issueTrackerConfigs.findFirst({
    where: and(
      eq(schema.issueTrackerConfigs.id, id),
      eq(schema.issueTrackerConfigs.repositoryId, repository.id)
    ),
  });
  if (!config) return notFound("Issue tracker config not found");

  await db.delete(schema.issueTrackerConfigs).where(eq(schema.issueTrackerConfigs.id, id));

  return success({ deleted: true });
});
