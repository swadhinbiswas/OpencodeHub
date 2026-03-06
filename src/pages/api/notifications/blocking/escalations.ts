import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, isNull, or, lte } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { notifications } from "@/db/schema";
import { success, unauthorized, parseBody } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { generateId } from "@/lib/utils";
import { getRoutingDecision, type NotificationRouteChannel } from "@/lib/notification-routing";

const BLOCKING_NOTIFICATION_TYPES = [
  "ci_failed",
  "review_request",
  "security_alert",
  "merge_conflict",
  "merge_blocked",
];

const BLOCKING_NOTIFICATION_REASONS = [
  "ci_failed",
  "review_requested",
  "security_alert",
  "merge_conflict",
  "merge_blocked",
];

const postSchema = z.object({
  thresholdHours: z.number().int().min(1).max(168).optional(),
  channels: z.array(z.enum(["in_app", "email", "slack", "browser_push"]))
    .min(1)
    .optional(),
  dryRun: z.boolean().optional(),
});

function parseThresholdHours(url: URL): number {
  const raw = Number.parseInt(url.searchParams.get("thresholdHours") || "4", 10);
  if (!Number.isFinite(raw) || raw < 1) return 4;
  return Math.min(raw, 168);
}

async function getBlockingCandidates(db: NodePgDatabase<typeof schema>, userId: string, thresholdHours: number) {
  const thresholdDate = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);

  return db.query.notifications.findMany({
    where: and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, false),
      eq(notifications.isArchived, false),
      lte(notifications.createdAt, thresholdDate),
      or(
        ...BLOCKING_NOTIFICATION_TYPES.map((type) => eq(notifications.type, type)),
        ...BLOCKING_NOTIFICATION_REASONS.map((reason) => eq(notifications.reason, reason))
      )!
    ),
    orderBy: [desc(notifications.createdAt)],
    limit: 200,
  });
}

export const GET: APIRoute = withErrorHandler(async ({ request, url }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const thresholdHours = parseThresholdHours(url);

  const [candidates, prefs] = await Promise.all([
    getBlockingCandidates(db, tokenPayload.userId, thresholdHours),
    db.query.notificationPreferences.findMany({
      where: and(
        eq(schema.notificationPreferences.userId, tokenPayload.userId),
        isNull(schema.notificationPreferences.repositoryId)
      ),
    }),
  ]);

  const preview = candidates.map((item) => {
    const routing = getRoutingDecision(item.type, prefs as any);
    return {
      id: item.id,
      type: item.type,
      reason: item.reason,
      title: item.title,
      createdAt: item.createdAt,
      channels: routing.channels,
      primaryChannel: routing.primaryChannel,
    };
  });

  return success({
    thresholdHours,
    totalCandidates: preview.length,
    candidates: preview,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) return unauthorized();

  const parsed = await parseBody(request, postSchema);
  if ("error" in parsed) return parsed.error;

  const thresholdHours = parsed.data.thresholdHours ?? 4;
  const dryRun = parsed.data.dryRun ?? true;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const [candidates, prefs] = await Promise.all([
    getBlockingCandidates(db, tokenPayload.userId, thresholdHours),
    db.query.notificationPreferences.findMany({
      where: and(
        eq(schema.notificationPreferences.userId, tokenPayload.userId),
        isNull(schema.notificationPreferences.repositoryId)
      ),
    }),
  ]);

  const escalations = candidates.map((item) => {
    const routing = getRoutingDecision(item.type, prefs as any);
    const selectedChannels = parsed.data.channels?.length
      ? routing.channels.filter((channel) => parsed.data.channels!.includes(channel as NotificationRouteChannel))
      : routing.channels;

    return {
      id: item.id,
      type: item.type,
      reason: item.reason,
      title: item.title,
      createdAt: item.createdAt,
      channels: selectedChannels,
      primaryChannel: selectedChannels[0] || routing.primaryChannel,
    };
  }).filter((entry) => entry.channels.length > 0);

  if (!dryRun) {
    for (const escalation of escalations) {
      await db.insert(schema.auditLogs).values({
        id: generateId(),
        userId: tokenPayload.userId,
        action: "notification_blocking_escalated",
        actorType: "system",
        actorId: tokenPayload.userId,
        targetType: "notification",
        targetId: escalation.id,
        targetName: escalation.title,
        data: JSON.stringify({
          thresholdHours,
          channels: escalation.channels,
          primaryChannel: escalation.primaryChannel,
          type: escalation.type,
          reason: escalation.reason,
        }),
        createdAt: new Date(),
      });
    }
  }

  return success({
    dryRun,
    thresholdHours,
    escalatedCount: escalations.length,
    escalations,
  });
});
