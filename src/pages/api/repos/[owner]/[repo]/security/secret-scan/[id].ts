import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canWriteRepo } from "@/lib/permissions";
import { resolveSecretAlert } from "@/lib/security-advanced";

const patchSchema = z.object({
  status: z.enum(["resolved", "false_positive"]),
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

export const PATCH: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const ownerName = params.owner;
  const repoName = params.repo;
  const id = params.id;
  if (!ownerName || !repoName || !id) return badRequest("Missing route parameters");

  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;

  const resolved = await resolveRepo(ownerName, repoName);
  if (!resolved?.repo) return notFound("Repository not found");
  if (!(await canWriteRepo(user.id, resolved.repo, { tokenScopes: user.scopes }))) return forbidden();

  const finding = await resolved.db.query.secretScanResults.findFirst({
    where: and(
      eq(schema.secretScanResults.id, id),
      eq(schema.secretScanResults.repositoryId, resolved.repo.id)
    ),
  });
  if (!finding) return notFound("Secret finding not found");

  const updated = await resolveSecretAlert(id, user.id, parsed.data.status);
  if (!updated) return badRequest("Failed to update secret finding status");

  return success({
    id,
    status: parsed.data.status,
  });
});
