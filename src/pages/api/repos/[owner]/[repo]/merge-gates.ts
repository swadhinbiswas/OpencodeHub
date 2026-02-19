import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canAdminRepo, canReadRepo } from "@/lib/permissions";
import { addRequiredCheck, createMergeGate, getMergeGates } from "@/lib/ci-gates";

const createPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("required_check"),
    branch: z.string().min(1),
    checkName: z.string().min(1),
    strictMode: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("merge_gate"),
    name: z.string().min(1),
    description: z.string().optional(),
    gateType: z.enum(["status_check", "review", "label", "custom"]),
    config: z.record(z.string(), z.unknown()).optional(),
    conditionScript: z.string().optional(),
  }),
]);

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

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repoName) return badRequest("Missing parameters");

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(user.id, repository, { isAdmin: user.isAdmin }))) {
    return notFound("Repository not found");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const requiredChecks = await db.query.requiredStatusChecks.findMany({
    where: eq(schema.requiredStatusChecks.repositoryId, repository.id),
  });
  const mergeGates = await getMergeGates(repository.id);

  return success({
    requiredChecks,
    mergeGates,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repoName) return badRequest("Missing parameters");

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.id, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = createPayloadSchema.safeParse(body || {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid merge gate payload");
  }

  if (parsed.data.kind === "required_check") {
    const check = await addRequiredCheck({
      repositoryId: repository.id,
      branch: parsed.data.branch,
      checkName: parsed.data.checkName,
      strictMode: parsed.data.strictMode,
    });
    return success({ kind: "required_check", check });
  }

  const gate = await createMergeGate({
    repositoryId: repository.id,
    name: parsed.data.name,
    description: parsed.data.description,
    gateType: parsed.data.gateType,
    config: parsed.data.config,
    conditionScript: parsed.data.conditionScript,
  });
  return success({ kind: "merge_gate", gate });
});
