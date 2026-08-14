import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, inArray } from "drizzle-orm";
import crypto from "crypto";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { CLOUD_PROVIDERS } from "@/lib/cloud-integrations";

const SUPPORTED_PROVIDERS = ["aws", "gcp", "azure", "kubernetes", "terraform"] as const;

const createSchema = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS),
  name: z.string().min(1).max(120).optional(),
  region: z.string().min(1).max(120).optional(),
  credentials: z.record(z.string()).default({}),
  settings: z.record(z.any()).optional(),
  isEnabled: z.boolean().optional(),
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

function redactConfig(config: any) {
  const credentialKeys = Object.keys((config?.credentials || {}) as Record<string, unknown>);
  return {
    ...config,
    credentials: undefined,
    hasCredentials: credentialKeys.length > 0,
    credentialKeys,
  };
}

export const GET: APIRoute = withErrorHandler(async ({ params, request, url }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(user?.userId, repository, { isAdmin: user?.isAdmin }))) {
    return notFound("Repository not found");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const includeSummary = url.searchParams.get("summary") === "1";

  const configs = await db.query.cloudConfigs.findMany({
    where: and(
      eq(schema.cloudConfigs.repositoryId, repository.id),
      inArray(schema.cloudConfigs.provider, SUPPORTED_PROVIDERS as unknown as string[])
    ),
    orderBy: [desc(schema.cloudConfigs.updatedAt)],
  });

  if (!includeSummary) {
    return success({
      providers: SUPPORTED_PROVIDERS.map((provider) => ({
        id: provider,
        ...CLOUD_PROVIDERS[provider],
      })),
      configs: configs.map(redactConfig),
    });
  }

  const configIds = configs.map((cfg) => cfg.id);
  const deployments = configIds.length
    ? await db.query.deployments.findMany({
      where: inArray(schema.deployments.configId, configIds),
      orderBy: [desc(schema.deployments.createdAt)],
      limit: 100,
    })
    : [];

  return success({
    providers: SUPPORTED_PROVIDERS.map((provider) => ({
      id: provider,
      ...CLOUD_PROVIDERS[provider],
    })),
    configs: configs.map(redactConfig),
    deployments,
  });
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

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const now = new Date();

  const existing = await db.query.cloudConfigs.findFirst({
    where: and(
      eq(schema.cloudConfigs.repositoryId, repository.id),
      eq(schema.cloudConfigs.provider, parsed.data.provider)
    ),
  });

  const payload = {
    provider: parsed.data.provider,
    name: parsed.data.name || CLOUD_PROVIDERS[parsed.data.provider].name,
    region: parsed.data.region || null,
    credentials: parsed.data.credentials,
    settings: parsed.data.settings || null,
    isEnabled: parsed.data.isEnabled ?? true,
    updatedAt: now,
  };

  if (existing) {
    await db.update(schema.cloudConfigs)
      .set(payload)
      .where(eq(schema.cloudConfigs.id, existing.id));

    const updated = await db.query.cloudConfigs.findFirst({
      where: eq(schema.cloudConfigs.id, existing.id),
    });

    return success(updated ? redactConfig(updated) : null);
  }

  const created = {
    id: crypto.randomUUID(),
    repositoryId: repository.id,
    organizationId: null,
    createdAt: now,
    ...payload,
  };

  await db.insert(schema.cloudConfigs).values(created);

  return success(redactConfig(created));
});
