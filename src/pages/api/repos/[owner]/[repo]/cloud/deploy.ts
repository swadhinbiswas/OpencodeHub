import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canWriteRepo } from "@/lib/permissions";
import { triggerCloudDeploy } from "@/lib/cloud-hooks";

const deploySchema = z.object({
  configId: z.string().optional(),
  imageTag: z.string().optional(),
  clusterName: z.string().optional(),
  serviceName: z.string().optional(),
  taskDefinition: z.string().optional(),
  appName: z.string().optional(),
  namespace: z.string().optional(),
  deploymentName: z.string().optional(),
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

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");
  const user = locals.user;
  if (!user) return unauthorized();

  const parsed = await parseBody(request, deploySchema);
  if ("error" in parsed) return parsed.error;

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");
  if (!(await canWriteRepo(user.id, repository, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
    return forbidden();
  }

  const results = await triggerCloudDeploy({
    repositoryId: repository.id,
    ...parsed.data,
  });

  return success({
    executed: results.length,
    results,
  });
});
