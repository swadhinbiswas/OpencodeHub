import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, parseBody, success, unauthorized, notFound } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { configureQualityProvider, getCoverageHistory, getQualityConfigs, getQualityIssues, QUALITY_PROVIDERS } from "@/lib/code-quality";
import { getAirGappedMessage, isAirGappedMode } from "@/lib/air-gapped";

const createSchema = z.object({
  provider: z.enum(["codecov", "coveralls", "sonarqube", "snyk"]),
  projectKey: z.string().min(1).max(200).optional(),
  apiToken: z.string().min(1).optional(),
  serverUrl: z.string().url().optional(),
  minCoverage: z.number().min(0).max(100).optional(),
  blockOnFail: z.boolean().optional(),
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
        error: { code: "AIR_GAPPED_MODE", message: getAirGappedMessage("Code quality integrations") },
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

  const includeSummary = url.searchParams.get("summary") === "1";
  const configs = await getQualityConfigs(repository.id);

  if (!includeSummary) {
    return success({
      providers: Object.entries(QUALITY_PROVIDERS).map(([id, value]) => ({ id, ...value })),
      configs: configs.map(redactConfig),
    });
  }

  const [coverage, issues] = await Promise.all([
    getCoverageHistory(repository.id, 20),
    getQualityIssues(repository.id),
  ]);

  return success({
    providers: Object.entries(QUALITY_PROVIDERS).map(([id, value]) => ({ id, ...value })),
    configs: configs.map(redactConfig),
    coverage,
    issues,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  if (isAirGappedMode()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "AIR_GAPPED_MODE", message: getAirGappedMessage("Code quality integrations") },
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

  if (!(await canWriteRepo(user.userId, repository, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
    return forbidden();
  }

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const config = await configureQualityProvider({
    repositoryId: repository.id,
    provider: parsed.data.provider,
    projectKey: parsed.data.projectKey,
    apiToken: parsed.data.apiToken,
    serverUrl: parsed.data.serverUrl,
    minCoverage: parsed.data.minCoverage,
    blockOnFail: parsed.data.blockOnFail,
  });

  return success(redactConfig(config));
});
