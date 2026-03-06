import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, gte } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";

function parseJsonData(value: string | null | undefined): Record<string, any> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export const GET: APIRoute = withErrorHandler(async ({ locals, url }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const rawDays = Number.parseInt(url.searchParams.get("days") || "30", 10);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 365) : 30;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const logs = await db.query.auditLogs.findMany({
    where: and(
      eq(schema.auditLogs.userId, user.id),
      eq(schema.auditLogs.action, "notification_digest_dead_letter"),
      gte(schema.auditLogs.createdAt, from)
    ),
    orderBy: [desc(schema.auditLogs.createdAt)],
    limit: 100,
  });

  return success({
    days,
    count: logs.length,
    items: logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      targetId: log.targetId,
      targetName: log.targetName,
      data: parseJsonData(log.data),
    })),
  });
});
