import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, created, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { canAdminRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";

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

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const { owner, repo } = params;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repo) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await getRepository(owner, repo);

  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.id, repository))) {
    return forbidden();
  }

  const integration = await db.query.externalCiIntegrations.findFirst({
    where: eq(schema.externalCiIntegrations.repositoryId, repository.id),
  });

  if (!integration) {
    return success({ enabled: false });
  }

  return success({
    enabled: true,
    name: integration.name,
    lastUsedAt: integration.lastUsedAt,
    createdAt: integration.createdAt,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const { owner, repo } = params;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repo) return badRequest("Missing parameters");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repository = await getRepository(owner, repo);

  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.id, repository))) {
    return forbidden();
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "External CI";

  const token = crypto.randomBytes(24).toString("hex");
  const tokenHash = hashToken(token);
  const now = new Date();

  const existing = await db.query.externalCiIntegrations.findFirst({
    where: eq(schema.externalCiIntegrations.repositoryId, repository.id),
  });

  if (existing) {
    await db.update(schema.externalCiIntegrations)
      .set({
        tokenHash,
        name,
        updatedAt: now,
      })
      .where(eq(schema.externalCiIntegrations.id, existing.id));
  } else {
    await db.insert(schema.externalCiIntegrations).values({
      id: generateId("external_ci"),
      repositoryId: repository.id,
      tokenHash,
      name,
      createdById: user.id,
      createdAt: now,
      updatedAt: now,
    });
  }

  return created({ token });
});
