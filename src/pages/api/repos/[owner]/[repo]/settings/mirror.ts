import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { canAdminRepo, canReadRepo } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { disableMirror, initializeMirror } from "@/lib/mirror-sync";

const configureMirrorSchema = z.object({
  mirrorUrl: z.string().url(),
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

const MIRROR_STALE_MINUTES = 24 * 60;

function deriveMirrorHealth(repository: {
  isMirror: boolean | null;
  mirrorSyncStatus: string | null;
  lastMirrorSyncAt: Date | null;
}) {
  if (!repository.isMirror) {
    return {
      lastSyncAgeMinutes: null as number | null,
      isStale: false,
      isHealthy: false,
    };
  }

  const nowMs = Date.now();
  const lastSyncMs = repository.lastMirrorSyncAt ? repository.lastMirrorSyncAt.getTime() : null;
  const lastSyncAgeMinutes = lastSyncMs ? Math.max(0, Math.floor((nowMs - lastSyncMs) / 60000)) : null;
  const isStale = lastSyncAgeMinutes === null ? true : lastSyncAgeMinutes > MIRROR_STALE_MINUTES;
  const isHealthy = repository.mirrorSyncStatus === "success" && !isStale;

  return {
    lastSyncAgeMinutes,
    isStale,
    isHealthy,
  };
}

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(user.userId, repository, { isAdmin: user.isAdmin }))) {
    return notFound("Repository not found");
  }

  const health = deriveMirrorHealth(repository);

  return success({
    isMirror: repository.isMirror,
    mirrorUrl: repository.mirrorUrl,
    mirrorSyncStatus: repository.mirrorSyncStatus,
    lastMirrorSyncAt: repository.lastMirrorSyncAt,
    ...health,
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

  const parsed = await parseBody(request, configureMirrorSchema);
  if ("error" in parsed) return parsed.error;

  const result = await initializeMirror(repository.id, parsed.data.mirrorUrl);
  if (!result.success) {
    return badRequest(result.error || "Failed to initialize mirror");
  }

  return success({
    configured: true,
    refsUpdated: result.refsUpdated,
  });
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, request }) => {
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

  const result = await disableMirror(repository.id);
  if (!result.success) {
    return badRequest(result.error || "Failed to disable mirror");
  }

  return success({ configured: false });
});
