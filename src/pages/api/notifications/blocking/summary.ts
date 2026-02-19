import { type APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, or } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { notifications } from "@/db/schema";
import { getUserFromRequest } from "@/lib/auth";
import { scoreNotificationPriority } from "@/lib/notification-priority";
import { success, unauthorized, serverError } from "@/lib/api";

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

export const GET: APIRoute = async ({ request }) => {
  try {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) return unauthorized();

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const blocking = await db.query.notifications.findMany({
      where: and(
        eq(notifications.userId, tokenPayload.userId),
        eq(notifications.isArchived, false),
        or(
          ...BLOCKING_NOTIFICATION_TYPES.map((type) => eq(notifications.type, type)),
          ...BLOCKING_NOTIFICATION_REASONS.map((reason) => eq(notifications.reason, reason))
        )!
      ),
      orderBy: [desc(notifications.createdAt)],
      limit: 100,
      with: {
        repository: {
          columns: { id: true, name: true, slug: true },
        },
      },
    });

    const scored = blocking.map((item) => {
      const priority = scoreNotificationPriority(item);
      return {
        ...item,
        priority: priority.priority,
        priorityScore: priority.score,
        isBlocking: priority.isBlocking,
      };
    });

    scored.sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const countsByType: Record<string, number> = {};
    const countsByReason: Record<string, number> = {};

    for (const item of scored) {
      const type = item.type || "unknown";
      const reason = item.reason || "unknown";
      countsByType[type] = (countsByType[type] || 0) + 1;
      countsByReason[reason] = (countsByReason[reason] || 0) + 1;
    }

    return success({
      totalBlocking: scored.length,
      unreadBlockingCount: scored.filter((item) => !item.isRead).length,
      countsByType,
      countsByReason,
      topPriority: scored[0]?.priority || null,
      items: scored.slice(0, 20),
    });
  } catch (error) {
    return serverError("Failed to load blocking notification summary");
  }
};
