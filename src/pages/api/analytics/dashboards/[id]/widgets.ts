import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getUserFromRequest } from "@/lib/auth";
import { addWidget } from "@/lib/analytics-advanced";

const addWidgetSchema = z.object({
  widgetType: z.string().min(1),
  title: z.string().min(1).max(120),
  config: z.record(z.string(), z.any()).optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    })
    .optional(),
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
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

  const parsed = await parseBody(request, addWidgetSchema);
  if ("error" in parsed) return parsed.error;

  const widget = await addWidget({
    dashboardId: id,
    widgetType: parsed.data.widgetType,
    title: parsed.data.title,
    config: parsed.data.config,
    position: parsed.data.position,
  });
  return success(widget);
});
