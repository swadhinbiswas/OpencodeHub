import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canAdminRepo } from "@/lib/permissions";
import { removeMergeGate, removeRequiredCheck, toggleGate } from "@/lib/ci-gates";

const patchPayloadSchema = z.object({
  enabled: z.boolean(),
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

export const PATCH: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const id = params.id;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repoName || !id) return badRequest("Missing parameters");

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.id, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const gate = await db.query.mergeGates.findFirst({
    where: and(
      eq(schema.mergeGates.id, id),
      eq(schema.mergeGates.repositoryId, repository.id)
    ),
  });
  if (!gate) return notFound("Merge gate not found");

  const body = await request.json().catch(() => null);
  const parsed = patchPayloadSchema.safeParse(body || {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid merge gate payload");
  }

  const ok = await toggleGate(gate.id, parsed.data.enabled);
  if (!ok) return badRequest("Failed to update merge gate");

  return success({ updated: true, id: gate.id, enabled: parsed.data.enabled });
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const id = params.id;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repoName || !id) return badRequest("Missing parameters");

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.id, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const requiredCheck = await db.query.requiredStatusChecks.findFirst({
    where: and(
      eq(schema.requiredStatusChecks.id, id),
      eq(schema.requiredStatusChecks.repositoryId, repository.id)
    ),
  });
  if (requiredCheck) {
    const ok = await removeRequiredCheck(requiredCheck.id);
    if (!ok) return badRequest("Failed to delete required check");
    return success({ deleted: true, kind: "required_check", id: requiredCheck.id });
  }

  const gate = await db.query.mergeGates.findFirst({
    where: and(
      eq(schema.mergeGates.id, id),
      eq(schema.mergeGates.repositoryId, repository.id)
    ),
  });
  if (!gate) return notFound("Merge gate or required check not found");

  const ok = await removeMergeGate(gate.id);
  if (!ok) return badRequest("Failed to delete merge gate");
  return success({ deleted: true, kind: "merge_gate", id: gate.id });
});
