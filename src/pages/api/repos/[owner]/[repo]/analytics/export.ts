import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, parseQuery } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import { exportMetrics } from "@/lib/analytics-advanced";

const querySchema = z.object({
  format: z.enum(["json", "csv", "prometheus"]).default("json"),
  metrics: z.string().default("pr_velocity,review_time,cycle_time"),
  start: z.string().optional(),
  end: z.string().optional(),
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

export const GET: APIRoute = withErrorHandler(async ({ params, url, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  if (!owner || !repoName) return badRequest("Missing route parameters");

  const parsed = parseQuery(url, querySchema);
  if ("error" in parsed) return parsed.error;

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");
  if (!(await canReadRepo(locals.user?.id, repository, { isAdmin: locals.user?.isAdmin }))) {
    return notFound("Repository not found");
  }

  const endDate = parsed.data.end ? new Date(parsed.data.end) : new Date();
  const startDate = parsed.data.start
    ? new Date(parsed.data.start)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return badRequest("Invalid start/end date");
  }

  const metricsRaw = parsed.data.metrics || "pr_velocity,review_time,cycle_time";
  const metrics = metricsRaw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (metrics.length === 0) return badRequest("At least one metric is required");

  const format = parsed.data.format || "json";
  const content = await exportMetrics({
    repositoryId: repository.id,
    metrics,
    startDate,
    endDate,
    format,
  });

  const contentType =
    format === "csv"
      ? "text/csv; charset=utf-8"
      : format === "prometheus"
        ? "text/plain; version=0.0.4; charset=utf-8"
        : "application/json; charset=utf-8";

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename=\"metrics-${repository.name}.${format === "prometheus" ? "txt" : format}\"`,
    },
  });
});
