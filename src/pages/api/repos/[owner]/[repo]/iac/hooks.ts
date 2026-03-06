import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canWriteRepo } from "@/lib/permissions";
import { triggerIaCHooks } from "@/lib/iac-hooks";

const triggerSchema = z.object({
  action: z.enum(["plan", "apply"]).default("plan"),
  runId: z.string().optional(),
  message: z.string().optional(),
  configId: z.string().optional(),
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

  const parsed = await parseBody(request, triggerSchema);
  if ("error" in parsed) return parsed.error;
  const action = parsed.data.action || "plan";
  if (action === "apply" && !parsed.data.runId) {
    return badRequest("runId is required for apply action");
  }

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");
  if (!(await canWriteRepo(user.id, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const results = await triggerIaCHooks({
    repositoryId: repository.id,
    action,
    runId: parsed.data.runId,
    message: parsed.data.message,
    configId: parsed.data.configId,
  });

  return success({
    action,
    executed: results.length,
    results,
  });
});
