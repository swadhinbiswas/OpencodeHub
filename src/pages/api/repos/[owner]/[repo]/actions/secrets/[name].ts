/**
 * Secrets API - Get/delete a single secret by name
 */
import { getDatabase, schema } from "@/db";
import {
  badRequest,
  forbidden,
  noContent,
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

async function resolveSecret(
  owner: string,
  repo: string,
  name: string,
  tokenPayload: any,
) {
  const db = getDatabase();

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return { error: notFound("User not found") };

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repo),
    ),
  });
  if (!repoData) return { error: notFound("Repository not found") };

  const canWrite = await canWriteRepo(tokenPayload?.userId, repoData);
  if (!canWrite) return { error: forbidden("Write access required") };

  const secret = await (db as any)
    .select()
    .from(schema.workflowSecrets)
    .where(
      and(
        eq(schema.workflowSecrets.repositoryId, repoData.id),
        eq(schema.workflowSecrets.name, name),
      ),
    );

  if (!secret || secret.length === 0) {
    return { error: notFound("Secret not found") };
  }

  return { db, repoData, secret: secret[0] };
}

export const GET: APIRoute = withErrorHandler((async ({
  params,
  request,
}: any) => {
  const { owner, repo, name } = params;
  if (!owner || !repo || !name) return badRequest("Missing parameters");

  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload?.userId) return unauthorized("Authentication required");

  const result = await resolveSecret(owner, repo, name, tokenPayload);
  if ("error" in result) return result.error;

  // Return metadata only, never the value
  return success({
    name: result.secret.name,
    environment: result.secret.environment,
    createdAt: result.secret.createdAt,
    updatedAt: result.secret.updatedAt,
  });
}) as any);

export const DELETE: APIRoute = withErrorHandler((async ({
  params,
  request,
}: any) => {
  const { owner, repo, name } = params;
  if (!owner || !repo || !name) return badRequest("Missing parameters");

  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload?.userId) return unauthorized("Authentication required");

  const result = await resolveSecret(owner, repo, name, tokenPayload);
  if ("error" in result) return result.error;

  await (result.db as any)
    .delete(schema.workflowSecrets)
    .where(eq(schema.workflowSecrets.id, result.secret.id));

  return noContent();
}) as any);

/** POST to set/update a secret by name (upsert) */
export const POST: APIRoute = withErrorHandler(
  async ({ params, request }: any) => {
    const { owner, repo, name: secretName } = params;
    if (!owner || !repo || !secretName) return badRequest("Missing parameters");

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
    const value = body?.value;
    if (!value) return badRequest("Secret value is required");
    const encryptedValue = encryptWorkflowSecret(value);

    // Check if already exists
    const existing = await (db as any)
      .select()
      .from(schema.workflowSecrets)
      .where(
        and(
          eq(schema.workflowSecrets.repositoryId, repoData.id),
          eq(schema.workflowSecrets.name, secretName),
        ),
      );

    if (existing.length > 0) {
      await (db as any)
        .update(schema.workflowSecrets)
        .set({ encryptedValue, updatedAt: new Date() })
        .where(eq(schema.workflowSecrets.id, existing[0].id));
      return success({ message: "Secret updated", name: secretName });
    }

    const { randomUUID } = await import("node:crypto");
    await (db as any).insert(schema.workflowSecrets).values({
      id: randomUUID(),
      repositoryId: repoData.id,
      name: secretName,
      encryptedValue,
      createdById: tokenPayload.userId,
    });

    return success({ message: "Secret created", name: secretName });
  },
);
