import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, like, or } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { canWriteRepo } from "@/lib/permissions";
import { parseBody, success, unauthorized, forbidden } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { encryptWorkflowSecret } from "@/lib/workflow-secret-crypto";
import {
  LEGACY_RUNNER_REGISTRATION_TOKEN_NAME,
  RUNNER_REGISTRATION_TOKEN_PREFIX,
  buildRunnerRegistrationTokenName,
  createRunnerRegistrationSecret,
  createRunnerRegistrationTokenId,
  getRunnerRegistrationTokenTtlMs,
} from "@/lib/runner-registration-token";
import { getRunnerTokenAuditHistory, logRunnerTokenAuditEvent } from "@/lib/runner-token-audit";

const createSchema = z.object({
  repositoryId: z.string(),
});

const revokeSchema = z.object({
  repositoryId: z.string(),
  tokenId: z.string().optional(),
});

export const GET: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const repositoryId = url.searchParams.get("repositoryId");
  if (!repositoryId) return unauthorized("Repository is required");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.id, repositoryId),
  });
  if (!repo) return unauthorized("Repository not found");
  if (!(await canWriteRepo(user.userId, repo, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
    return forbidden("Insufficient permissions");
  }

  const events = await getRunnerTokenAuditHistory(repo.id, 100);
  return success({ events });
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.id, parsed.data.repositoryId),
    with: { owner: true },
  });
  if (!repo) return unauthorized("Repository not found");
  if (!(await canWriteRepo(user.userId, repo, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
    return forbidden("Insufficient permissions");
  }

  const tokenId = createRunnerRegistrationTokenId();
  const secret = createRunnerRegistrationSecret();
  await db.insert(schema.workflowSecrets).values({
    id: tokenId,
    repositoryId: repo.id,
    name: buildRunnerRegistrationTokenName(tokenId),
    encryptedValue: encryptWorkflowSecret(secret),
    createdById: user.userId,
  });

  const ttlMs = getRunnerRegistrationTokenTtlMs();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await logRunnerTokenAuditEvent({
    request,
    repositoryId: repo.id,
    tokenId,
    action: "issued",
    userId: user.userId,
    actorType: "user",
    data: {
      tokenName: buildRunnerRegistrationTokenName(tokenId),
      expiresAt,
      oneTime: true,
    },
  });

  return success({
    tokenId,
    token: `${repo.owner.username}/${repo.name}:${secret}`,
    expiresAt,
    oneTime: true,
  });
});

export const DELETE: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const parsed = await parseBody(request, revokeSchema);
  if ("error" in parsed) return parsed.error;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.id, parsed.data.repositoryId),
  });
  if (!repo) return unauthorized("Repository not found");
  if (!(await canWriteRepo(user.userId, repo, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
    return forbidden("Insufficient permissions");
  }

  if (parsed.data.tokenId) {
    await logRunnerTokenAuditEvent({
      request,
      repositoryId: repo.id,
      tokenId: parsed.data.tokenId,
      action: "revoked",
      userId: user.userId,
      actorType: "user",
      data: {
        scope: "single",
      },
    });

    await db
      .delete(schema.workflowSecrets)
      .where(
        and(
          eq(schema.workflowSecrets.repositoryId, repo.id),
          eq(
            schema.workflowSecrets.name,
            buildRunnerRegistrationTokenName(parsed.data.tokenId)
          )
        )
      );
  } else {
    const tokenRows = await db.query.workflowSecrets.findMany({
      where: and(
        eq(schema.workflowSecrets.repositoryId, repo.id),
        or(
          eq(schema.workflowSecrets.name, LEGACY_RUNNER_REGISTRATION_TOKEN_NAME),
          like(schema.workflowSecrets.name, `${RUNNER_REGISTRATION_TOKEN_PREFIX}%`)
        )
      ),
      columns: {
        name: true,
      },
    });

    for (const tokenRow of tokenRows) {
      const tokenId = tokenRow.name.startsWith(RUNNER_REGISTRATION_TOKEN_PREFIX)
        ? tokenRow.name.slice(RUNNER_REGISTRATION_TOKEN_PREFIX.length)
        : tokenRow.name;
      await logRunnerTokenAuditEvent({
        request,
        repositoryId: repo.id,
        tokenId,
        action: "revoked",
        userId: user.userId,
        actorType: "user",
        data: {
          scope: "all",
        },
      });
    }

    await db
      .delete(schema.workflowSecrets)
      .where(
        and(
          eq(schema.workflowSecrets.repositoryId, repo.id),
          or(
            eq(schema.workflowSecrets.name, LEGACY_RUNNER_REGISTRATION_TOKEN_NAME),
            like(schema.workflowSecrets.name, `${RUNNER_REGISTRATION_TOKEN_PREFIX}%`)
          )
        )
      );
  }

  return success({ revoked: true });
});
