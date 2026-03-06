import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withErrorHandler } from "@/lib/errors";
import {
  badRequest,
  forbidden,
  notFound,
  success,
  unauthorized,
} from "@/lib/api";
import {
  getRepositorySecurityPolicy,
  upsertRepositorySecurityPolicy,
} from "@/lib/security-policies";

const PolicySchema = z.object({
  enforcementMode: z.enum(["warn", "block"]).default("warn"),
  secretBlockedTypes: z.array(z.string()).default([]),
  secretMinSeverity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]).default("HIGH"),
  licenseAllowedTypes: z.array(z.string()).default(["permissive"]),
  licenseBlockedLicenses: z.array(z.string()).default([]),
  isEnabled: z.boolean().default(true),
});

async function resolveRepo(ownerName: string, repoName: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const owner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!owner) return null;

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, owner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  return { db, repo };
}

export const GET: APIRoute = withErrorHandler(async ({ locals, params }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const ownerName = params.owner;
  const repoName = params.repo;
  if (!ownerName || !repoName) return badRequest("Missing repository parameters");

  const resolved = await resolveRepo(ownerName, repoName);
  if (!resolved?.repo) return notFound("Repository not found");
  if (!(await canReadRepo(user.id, resolved.repo))) return forbidden();

  const policy = await getRepositorySecurityPolicy(resolved.repo.id);
  return success({ policy });
});

export const PUT: APIRoute = withErrorHandler(async ({ locals, params, request }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const ownerName = params.owner;
  const repoName = params.repo;
  if (!ownerName || !repoName) return badRequest("Missing repository parameters");

  const resolved = await resolveRepo(ownerName, repoName);
  if (!resolved?.repo) return notFound("Repository not found");
  if (!(await canWriteRepo(user.id, resolved.repo))) return forbidden();

  const body = await request.json();
  const parsed = PolicySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid policy payload", {
      issues: parsed.error.issues,
    });
  }

  const policy = await upsertRepositorySecurityPolicy({
    repositoryId: resolved.repo.id,
    userId: user.id,
    ...parsed.data,
  });

  return success({ policy });
});

