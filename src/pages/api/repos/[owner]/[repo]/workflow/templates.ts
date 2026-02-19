import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, parseQuery, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { applyTemplateToRepo, getWorkflowTemplates } from "@/lib/workflow-templates";

const querySchema = z.object({
  category: z.string().optional(),
  language: z.string().optional(),
});

const applyTemplateSchema = z.object({
  templateId: z.string().min(1),
  workflowName: z.string().min(1).max(120).optional(),
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

export const GET: APIRoute = withErrorHandler(async ({ params, url, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = locals.user;
  if (!user) return unauthorized();

  const parsed = parseQuery(url, querySchema);
  if ("error" in parsed) return parsed.error;

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(user.id, repository, { isAdmin: user.isAdmin }))) {
    return notFound("Repository not found");
  }

  const templates = await getWorkflowTemplates({
    category: parsed.data.category,
    language: parsed.data.language,
  });

  return success({ templates });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = locals.user;
  if (!user) return unauthorized();

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canWriteRepo(user.id, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const parsed = await parseBody(request, applyTemplateSchema);
  if ("error" in parsed) return parsed.error;

  const workflow = await applyTemplateToRepo({
    repositoryId: repository.id,
    templateId: parsed.data.templateId,
    workflowName: parsed.data.workflowName,
  });

  return success({ workflow });
});
