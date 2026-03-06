/**
 * Secrets API - List and create repository secrets
 */
import { getDatabase, schema } from "@/db";
import {
  badRequest,
  forbidden,
  notFound,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { canWriteRepo } from "@/lib/permissions";
import { encryptWorkflowSecret } from "@/lib/workflow-secret-crypto";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const createSecretSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[A-Z_][A-Z0-9_]*$/i, "Invalid secret name format"),
  value: z.string().min(1),
  environment: z.string().optional(),
});

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) return badRequest("Owner and repo required");

  const db = getDatabase();
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload?.userId) return unauthorized("Authentication required");

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return notFound("User not found");

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
  if (!repoData) return notFound("Repository not found");

  const canWrite = await canWriteRepo(tokenPayload.userId, repoData);
  if (!canWrite) return forbidden("Write access required to view secrets");

  const url = new URL(request.url);
  const environment = url.searchParams.get("environment");

  const conditions = [eq(schema.workflowSecrets.repositoryId, repoData.id)];
  if (environment) {
    conditions.push(eq(schema.workflowSecrets.environment, environment));
  }

  const secrets = await (db as any)
    .select({
      name: schema.workflowSecrets.name,
      environment: schema.workflowSecrets.environment,
      createdAt: schema.workflowSecrets.createdAt,
      updatedAt: schema.workflowSecrets.updatedAt,
    })
    .from(schema.workflowSecrets)
    .where(and(...conditions));

  // Never return secret values
  return success(secrets);
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) return badRequest("Owner and repo required");

  const db = getDatabase();
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload?.userId) return unauthorized("Authentication required");

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return notFound("User not found");

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
  if (!repoData) return notFound("Repository not found");

  const canWrite = await canWriteRepo(tokenPayload.userId, repoData);
  if (!canWrite) return forbidden("Write access required");

  const body = await request.json();
  const parsed = createSecretSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { name, value, environment } = parsed.data;
  const encryptedValue = encryptWorkflowSecret(value);

  // Check if secret already exists (upsert)
  const existing = await (db as any)
    .select()
    .from(schema.workflowSecrets)
    .where(
      and(
        eq(schema.workflowSecrets.repositoryId, repoData.id),
        eq(schema.workflowSecrets.name, name),
        environment
          ? eq(schema.workflowSecrets.environment, environment)
          : undefined,
      ),
    );

  if (existing.length > 0) {
    // Update existing secret
    await (db as any)
      .update(schema.workflowSecrets)
      .set({ encryptedValue, updatedAt: new Date() })
      .where(eq(schema.workflowSecrets.id, existing[0].id));

    return success({ message: "Secret updated", name });
  }

  // Create new secret
  await (db as any).insert(schema.workflowSecrets).values({
    id: randomUUID(),
    repositoryId: repoData.id,
    name,
    encryptedValue,
    environment: environment || null,
    createdById: tokenPayload.userId,
  });

  return success({ message: "Secret created", name });
});
