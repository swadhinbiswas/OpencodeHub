import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, notFound } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { PATCH as patchPullRequest } from "@/pages/api/repos/[owner]/[repo]/pulls/[number]/index";

const transitionSchema = z.object({
  state: z.string().optional(),
  stateId: z.string().optional(),
});

async function resolveRepositoryId(owner: string, repo: string): Promise<string | null> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return null;

  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo)
    ),
    columns: { id: true },
  });
  return repository?.id || null;
}

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const owner = params.owner;
  const repo = params.repo;
  const number = params.number;
  if (!owner || !repo || !number) return badRequest("Missing parameters");

  const body = await request.json().catch(() => null);
  const parsed = transitionSchema.safeParse(body || {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid state transition payload");
  }

  const hasState = typeof parsed.data.state === "string" && parsed.data.state.trim() !== "";
  const hasStateId = typeof parsed.data.stateId === "string" && parsed.data.stateId.trim() !== "";
  if (!hasState && !hasStateId) {
    return badRequest("Either state or stateId is required");
  }
  if (hasState && hasStateId) {
    return badRequest("Provide either state or stateId, not both");
  }

  let targetState = parsed.data.state?.trim();
  if (hasStateId) {
    const repositoryId = await resolveRepositoryId(owner, repo);
    if (!repositoryId) return notFound("Repository not found");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const stateDef = await db.query.prStateDefinitions.findFirst({
      where: and(
        eq(schema.prStateDefinitions.id, parsed.data.stateId!),
        eq(schema.prStateDefinitions.repositoryId, repositoryId)
      ),
      columns: { name: true },
    });
    if (!stateDef) {
      return notFound("State definition not found");
    }
    targetState = stateDef.name;
  }

  const forwardedRequest = new Request(request.url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ state: targetState }),
  });

  return patchPullRequest({
    params: { owner, repo, number },
    locals,
    request: forwardedRequest,
  } as any);
});
