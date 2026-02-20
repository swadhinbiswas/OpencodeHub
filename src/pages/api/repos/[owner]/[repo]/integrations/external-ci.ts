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
import { CI_PROVIDERS } from "@/lib/external-ci";
import { getAirGappedMessage, isAirGappedMode } from "@/lib/air-gapped";

const SUPPORTED_PROVIDERS = ["gitlab", "circleci", "buildkite", "jenkins"] as const;

const createSchema = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS),
  name: z.string().min(1).max(120).optional(),
  baseUrl: z.string().url(),
  apiToken: z.string().min(1).optional(),
  projectId: z.string().min(1).max(300).optional(),
  isEnabled: z.boolean().optional(),
  syncStatus: z.boolean().optional(),
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

function toProviderEntry(provider: (typeof SUPPORTED_PROVIDERS)[number]) {
  const source = CI_PROVIDERS[provider];
  return {
    id: provider,
    ...source,
  };
}

function redactConfig(config: any) {
  return {
    ...config,
    apiToken: undefined,
  };
}

export const GET: APIRoute = withErrorHandler(async ({ params, request, url }) => {
  if (isAirGappedMode()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "AIR_GAPPED_MODE", message: getAirGappedMessage("External CI integrations") },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

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

  const configs = await db.query.externalCIConfigs.findMany({
    where: and(
      eq(schema.externalCIConfigs.repositoryId, repository.id),
      inArray(schema.externalCIConfigs.provider, SUPPORTED_PROVIDERS as unknown as string[])
    ),
    orderBy: [desc(schema.externalCIConfigs.updatedAt)],
  });

  if (!includeSummary) {
    return success({
      providers: SUPPORTED_PROVIDERS.map(toProviderEntry),
      configs: configs.map(redactConfig),
    });
  }

  const configIds = configs.map((config) => config.id);
  const builds = configIds.length
    ? await db.query.externalBuilds.findMany({
      where: inArray(schema.externalBuilds.configId, configIds),
      orderBy: [desc(schema.externalBuilds.createdAt)],
      limit: 50,
    })
    : [];

  return success({
    providers: SUPPORTED_PROVIDERS.map(toProviderEntry),
    configs: configs.map(redactConfig),
    builds,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  if (isAirGappedMode()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "AIR_GAPPED_MODE", message: getAirGappedMessage("External CI integrations") },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canWriteRepo(user.userId, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const now = new Date();
  const existing = await db.query.externalCIConfigs.findFirst({
    where: and(
      eq(schema.externalCIConfigs.repositoryId, repository.id),
      eq(schema.externalCIConfigs.provider, parsed.data.provider)
    ),
  });

  const payload = {
    provider: parsed.data.provider,
    name: parsed.data.name || CI_PROVIDERS[parsed.data.provider].name,
    baseUrl: parsed.data.baseUrl,
    projectId: parsed.data.projectId || null,
    ...(parsed.data.apiToken ? { apiToken: parsed.data.apiToken } : {}),
    isEnabled: parsed.data.isEnabled ?? true,
    syncStatus: parsed.data.syncStatus ?? true,
    updatedAt: now,
  };

  if (existing) {
    await db.update(schema.externalCIConfigs)
      .set(payload)
      .where(eq(schema.externalCIConfigs.id, existing.id));

    const updated = await db.query.externalCIConfigs.findFirst({
      where: eq(schema.externalCIConfigs.id, existing.id),
    });

    return success(updated ? redactConfig(updated) : null);
  }

  const created = {
    id: crypto.randomUUID(),
    repositoryId: repository.id,
    webhookSecret: crypto.randomUUID(),
    createdAt: now,
    ...payload,
  };

  await db.insert(schema.externalCIConfigs).values(created);

  return success(redactConfig(created));
});
