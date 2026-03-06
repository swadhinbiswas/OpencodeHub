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

const DIGEST_ACTIONS = [
  "notification_digest_sent",
  "notification_digest_retry",
  "notification_digest_dead_letter",
  "notification_digest_skipped",
];

export const GET: APIRoute = withErrorHandler(async ({ locals, url }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const rawDays = Number.parseInt(url.searchParams.get("days") || "30", 10);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 365) : 30;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const events = await db.query.auditLogs.findMany({
    where: and(
      eq(schema.auditLogs.userId, user.id),
      gte(schema.auditLogs.createdAt, from)
    ),
    orderBy: [desc(schema.auditLogs.createdAt)],
    limit: 1000,
  });

  const digestEvents = events.filter((item) => DIGEST_ACTIONS.includes(item.action));
  const sent = digestEvents.filter((item) => item.action === "notification_digest_sent");
  const retries = digestEvents.filter((item) => item.action === "notification_digest_retry");
  const deadLetters = digestEvents.filter((item) => item.action === "notification_digest_dead_letter");
  const skipped = digestEvents.filter((item) => item.action === "notification_digest_skipped");

  let smtpDeliveries = 0;
  let logDeliveries = 0;
  let totalAttempts = 0;
  let recoveredCount = 0;

  for (const event of digestEvents) {
    const data = parseJsonData(event.data);
    const provider = data.provider;
    const attempts = Number(data.attempts || 0);
    const recovered = Boolean(data.recovered);

    if (provider === "smtp") smtpDeliveries++;
    if (provider === "log") logDeliveries++;
    totalAttempts += Number.isFinite(attempts) ? attempts : 0;
    if (recovered) recoveredCount++;
  }

  const sentCount = sent.length;
  const successRate = sentCount + deadLetters.length > 0
    ? Math.round((sentCount / (sentCount + deadLetters.length)) * 100)
    : 100;

  return success({
    days,
    summary: {
      totalEvents: digestEvents.length,
      sent: sentCount,
      retries: retries.length,
      deadLetters: deadLetters.length,
      skipped: skipped.length,
      successRate,
      recoveredCount,
      averageAttempts: digestEvents.length > 0 ? Math.round((totalAttempts / digestEvents.length) * 100) / 100 : 0,
    },
    providers: {
      smtp: smtpDeliveries,
      log: logDeliveries,
    },
    recentDeadLetters: deadLetters.slice(0, 20).map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      targetId: item.targetId,
      data: parseJsonData(item.data),
    })),
  });
});
