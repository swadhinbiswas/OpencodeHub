import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { forbidden, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { getDashboard } from "@/lib/analytics-advanced";

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const id = params.id;
  if (!id) return notFound("Dashboard not found");

  const user = await getUserFromRequest(request);
  const payload = await getDashboard(id);
  if (!payload) return notFound("Dashboard not found");

  const canRead = payload.dashboard.isPublic || user?.userId === payload.dashboard.userId || user?.isAdmin;
  if (!canRead) return notFound("Dashboard not found");
  return success(payload);
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, request }) => {
  const id = params.id;
  if (!id) return notFound("Dashboard not found");

  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const dashboard = await db.query.customDashboards?.findFirst({
    where: eq(schema.customDashboards.id, id),
  });
  if (!dashboard) return notFound("Dashboard not found");
  if (dashboard.userId !== user.userId && !user.isAdmin) return forbidden();

  await db.delete(schema.customDashboards).where(eq(schema.customDashboards.id, id));
  return success({ deleted: true });
});
