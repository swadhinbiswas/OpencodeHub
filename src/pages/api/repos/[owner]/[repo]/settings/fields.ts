import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo, canReadRepo } from "@/lib/permissions";
import { createCustomField, getCustomFields } from "@/lib/custom-fields";

const createFieldSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["text", "number", "date", "boolean", "checkbox", "select", "multiselect", "user"]),
  description: z.string().max(500).optional(),
  options: z.array(z.string().min(1).max(120)).optional(),
  required: z.boolean().optional(),
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

  const fields = await getCustomFields(repository.id);
  return success(fields);
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canWriteRepo(user.userId, repository, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
    return forbidden();
  }

  const parsed = await parseBody(request, createFieldSchema);
  if ("error" in parsed) return parsed.error;

  const type =
    parsed.data.type === "boolean" || parsed.data.type === "checkbox"
      ? "checkbox"
      : parsed.data.type === "user"
        ? "text"
        : parsed.data.type;

  const field = await createCustomField({
    repositoryId: repository.id,
    name: parsed.data.name,
    fieldType: type as "text" | "number" | "date" | "select" | "multiselect" | "checkbox",
    description: parsed.data.description,
    isRequired: parsed.data.required,
    options: parsed.data.options,
  });

  return success(field);
});
