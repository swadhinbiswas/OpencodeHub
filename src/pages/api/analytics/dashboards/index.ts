import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { createDashboard } from "@/lib/analytics-advanced";

const createDashboardSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

export const GET: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const dashboards =
    (await db.query.customDashboards?.findMany({
      where: eq(schema.customDashboards.userId, user.userId),
      orderBy: [desc(schema.customDashboards.updatedAt)],
    })) || [];

  return success(dashboards);
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const parsed = await parseBody(request, createDashboardSchema);
  if ("error" in parsed) return parsed.error;

  const dashboard = await createDashboard({
    userId: user.userId,
    name: parsed.data.name,
    description: parsed.data.description,
    isPublic: parsed.data.isPublic,
  });

  return success(dashboard);
});
