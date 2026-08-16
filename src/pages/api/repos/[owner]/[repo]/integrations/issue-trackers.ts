import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { configureIssueTracker, getIssueTrackerConfigs, ISSUE_PROVIDERS } from "@/lib/issue-trackers";
import { getAirGappedMessage, isAirGappedMode } from "@/lib/air-gapped";

const createSchema = z.object({
  provider: z.enum(["jira", "linear", "trello", "clickup"]),
  name: z.string().min(1).max(120),
  apiUrl: z.string().url().optional(),
  apiToken: z.string().min(1),
  projectKey: z.string().min(1).max(200),
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

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  if (isAirGappedMode()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "AIR_GAPPED_MODE", message: getAirGappedMessage("Issue tracker integrations") },
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
  const url = new URL(request.url);
  const includeSummary = url.searchParams.get("summary") === "1";
  const configs = await getIssueTrackerConfigs(repository.id);
  const providers = Object.entries(ISSUE_PROVIDERS).map(([key, value]) => ({
    id: key,
    ...value,
  }));

  if (!includeSummary) {
    return success({
      providers,
      configs: configs.map(redactConfig),
    });
  }

  const configIds = configs.map((config) => config.id);
  const links = configIds.length
    ? await db.query.issueTrackerLinks.findMany({
      where: inArray(schema.issueTrackerLinks.configId, configIds),
      orderBy: [desc(schema.issueTrackerLinks.createdAt)],
      limit: 50,
    })
    : [];

  return success({
    providers,
    configs: configs.map(redactConfig),
    links,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  if (isAirGappedMode()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "AIR_GAPPED_MODE", message: getAirGappedMessage("Issue tracker integrations") },
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

  const config = await configureIssueTracker({
    repositoryId: repository.id,
    provider: parsed.data.provider,
    name: parsed.data.name,
    apiUrl: parsed.data.apiUrl,
    apiToken: parsed.data.apiToken,
    projectKey: parsed.data.projectKey,
  });

  return success(redactConfig(config));
});
