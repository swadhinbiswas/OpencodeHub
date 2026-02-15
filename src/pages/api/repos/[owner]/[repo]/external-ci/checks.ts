import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { upsertCheckRun, updateMergeableState } from "@/lib/pr-checks";

async function getRepository(owner: string, repo: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });

  if (!ownerUser) return null;

  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo)
    ),
  });
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return request.headers.get("x-opencodehub-token");
}

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;

  if (!owner || !repo) return badRequest("Missing parameters");

  const token = getTokenFromRequest(request);
  if (!token) return unauthorized("Missing external CI token");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await getRepository(owner, repo);

  if (!repository) return notFound("Repository not found");

  const integration = await db.query.externalCiIntegrations.findFirst({
    where: eq(schema.externalCiIntegrations.repositoryId, repository.id),
  });

  if (!integration) return unauthorized("External CI integration not configured");

  const tokenHash = hashToken(token);
  if (tokenHash !== integration.tokenHash) {
    return unauthorized("Invalid external CI token");
  }

  const body = await request.json();
  const {
    pullRequestNumber,
    pullRequestId,
    name,
    headSha,
    status,
    conclusion,
    externalId,
    detailsUrl,
    output,
  } = body || {};

  if (!name || !headSha || !status) {
    return badRequest("Missing required fields");
  }

  let pr = null;
  if (pullRequestId) {
    pr = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.id, pullRequestId),
        eq(schema.pullRequests.repositoryId, repository.id)
      ),
    });
  } else if (typeof pullRequestNumber === "number") {
    pr = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.number, pullRequestNumber),
        eq(schema.pullRequests.repositoryId, repository.id)
      ),
    });
  }

  if (!pr) return notFound("Pull request not found");

  await upsertCheckRun(pr.id, {
    name,
    headSha,
    status,
    conclusion,
    externalId,
    detailsUrl,
    output,
  });

  await updateMergeableState(pr.id);

  await db.update(schema.externalCiIntegrations)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.externalCiIntegrations.id, integration.id));

  return success({ success: true });
});
