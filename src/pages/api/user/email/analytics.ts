import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, gte, isNull } from "drizzle-orm";
import { success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getDatabase, schema } from "@/db";
import { isSmtpConfigured } from "@/lib/email";

const EVENT_TYPES = [
  "mention",
  "assign",
  "review_request",
  "review_submitted",
  "pr_approved",
  "pr_changes_requested",
  "pr_merged",
  "pr_closed",
  "comment",
  "ci_passed",
  "ci_failed",
  "merge_queue",
  "stack_update",
  "ai_review",
  "star",
  "watching",
] as const;

function estimateNextDigestAt(digestType: string | null | undefined, digestTime: string | null | undefined): string | null {
  if (!digestType || digestType === "none" || !digestTime) return null;
  const [hh, mm] = digestTime.split(":").map((x) => Number.parseInt(x || "0", 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hh, mm, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + (digestType === "weekly" ? 7 : 1));
  return next.toISOString();
}

export const GET: APIRoute = withErrorHandler(async ({ locals }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [prefs, digest, unread, recent] = await Promise.all([
    db.query.notificationPreferences.findMany({
      where: and(
        eq(schema.notificationPreferences.userId, user.id),
        isNull(schema.notificationPreferences.repositoryId),
      ),
    }),
    db.query.emailDigestSettings.findFirst({ where: eq(schema.emailDigestSettings.userId, user.id) }),
    db.query.notifications.findMany({
      where: and(
        eq(schema.notifications.userId, user.id),
        eq(schema.notifications.isRead, false),
        eq(schema.notifications.isArchived, false),
      ),
      columns: { id: true },
      limit: 500,
    }),
    db.query.notifications.findMany({
      where: and(
        eq(schema.notifications.userId, user.id),
        gte(schema.notifications.createdAt, sevenDaysAgo),
      ),
      columns: { id: true },
      limit: 5000,
    }),
  ]);

  const enabledCount = EVENT_TYPES.filter((eventType) => {
    const pref = prefs.find((item) => item.eventType === eventType);
    return pref?.emailEnabled ?? true;
  }).length;

  const disabledCount = EVENT_TYPES.length - enabledCount;

  const recommendations: string[] = [];
  if (!isSmtpConfigured()) recommendations.push("SMTP is not configured for real email delivery.");
  if (!digest || digest.digestType === "none") recommendations.push("Enable daily or weekly digests to improve email routing coverage.");
  if (disabledCount > enabledCount) recommendations.push("Most event routes are disabled for email; review routing preferences.");

  return success({
    smtpConfigured: isSmtpConfigured(),
    routing: {
      totalEvents: EVENT_TYPES.length,
      emailEnabledEvents: enabledCount,
      emailDisabledEvents: disabledCount,
      coveragePercent: Math.round((enabledCount / EVENT_TYPES.length) * 100),
    },
    digest: {
      digestType: digest?.digestType || "none",
      digestTime: digest?.digestTime || null,
      digestDay: digest?.digestDay || null,
      timezone: digest?.timezone || "UTC",
      lastSentAt: digest?.lastSentAt || null,
      estimatedNextRunAt: estimateNextDigestAt(digest?.digestType, digest?.digestTime),
    },
    volume: {
      unreadCount: unread.length,
      notificationsLast7Days: recent.length,
      eligibleEmailEventsLast7Days: Math.round((recent.length * enabledCount) / EVENT_TYPES.length),
    },
    recommendations,
  });
});
