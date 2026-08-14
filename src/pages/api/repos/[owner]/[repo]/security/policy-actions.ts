import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canWriteRepo } from "@/lib/permissions";
import {
  getRepositorySecurityPolicy,
  upsertRepositorySecurityPolicy,
} from "@/lib/security-policies";

const actionSchema = z.object({
  action: z.enum([
    "secret:block_type",
    "secret:unblock_type",
    "license:block",
    "license:unblock",
    "license:allow_type",
    "license:disallow_type",
  ]),
  value: z.string().min(1),
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
  if (!repo) return null;

  return { db, repo };
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const ownerName = params.owner;
  const repoName = params.repo;
  if (!ownerName || !repoName) return badRequest("Missing route parameters");

  const parsed = await parseBody(request, actionSchema);
  if ("error" in parsed) return parsed.error;

  const resolved = await resolveRepo(ownerName, repoName);
  if (!resolved?.repo) return notFound("Repository not found");
  if (!(await canWriteRepo(user.id, resolved.repo, { tokenScopes: user.scopes }))) return forbidden();

  const policy = await getRepositorySecurityPolicy(resolved.repo.id);
  const value = parsed.data.value.trim();

  let secretBlockedTypes = [...policy.secretBlockedTypes];
  let licenseBlockedLicenses = [...policy.licenseBlockedLicenses];
  let licenseAllowedTypes = [...policy.licenseAllowedTypes];

  switch (parsed.data.action) {
    case "secret:block_type":
      secretBlockedTypes.push(value);
      secretBlockedTypes = dedupe(secretBlockedTypes);
      break;
    case "secret:unblock_type":
      secretBlockedTypes = secretBlockedTypes.filter((entry) => entry.toLowerCase() !== value.toLowerCase());
      break;
    case "license:block":
      licenseBlockedLicenses.push(value);
      licenseBlockedLicenses = dedupe(licenseBlockedLicenses);
      break;
    case "license:unblock":
      licenseBlockedLicenses = licenseBlockedLicenses.filter((entry) => entry.toLowerCase() !== value.toLowerCase());
      break;
    case "license:allow_type":
      licenseAllowedTypes.push(value.toLowerCase());
      licenseAllowedTypes = dedupe(licenseAllowedTypes);
      break;
    case "license:disallow_type":
      licenseAllowedTypes = licenseAllowedTypes.filter((entry) => entry.toLowerCase() !== value.toLowerCase());
      break;
  }

  const updated = await upsertRepositorySecurityPolicy({
    repositoryId: resolved.repo.id,
    userId: user.id,
    enforcementMode: policy.enforcementMode,
    secretMinSeverity: policy.secretMinSeverity,
    secretBlockedTypes,
    licenseAllowedTypes,
    licenseBlockedLicenses,
    isEnabled: policy.isEnabled,
  });

  return success({ policy: updated });
});
