import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { badRequest, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { getDatabase, schema } from "@/db";

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

const updateSchema = z.object({
  routes: z.record(z.boolean()),
});

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const GET: APIRoute = withErrorHandler(async ({ locals }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const prefs = await db.query.notificationPreferences.findMany({
    where: and(
      eq(schema.notificationPreferences.userId, user.id),
      isNull(schema.notificationPreferences.repositoryId),
    ),
  });

  const routing = Object.fromEntries(
    EVENT_TYPES.map((eventType) => {
      const pref = prefs.find((item) => item.eventType === eventType);
      return [eventType, pref?.emailEnabled ?? true];
    }),
  );

  return success({
    eventTypes: EVENT_TYPES,
    routing,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ locals, request }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body || {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid routing payload");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  for (const [eventType, enabled] of Object.entries(parsed.data.routes)) {
    if (!(EVENT_TYPES as readonly string[]).includes(eventType)) {
      return badRequest(`Unsupported event type: ${eventType}`);
    }

    const existing = await db.query.notificationPreferences.findFirst({
      where: and(
        eq(schema.notificationPreferences.userId, user.id),
        eq(schema.notificationPreferences.eventType, eventType),
        isNull(schema.notificationPreferences.repositoryId),
      ),
    });

    if (existing) {
      await db
        .update(schema.notificationPreferences)
        .set({
          emailEnabled: enabled,
          updatedAt: new Date(),
        })
        .where(eq(schema.notificationPreferences.id, existing.id));
    } else {
      await db.insert(schema.notificationPreferences).values({
        id: generateId(),
        userId: user.id,
        eventType,
        emailEnabled: enabled,
        slackEnabled: false,
        inAppEnabled: true,
        browserPushEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return success({
    updated: Object.keys(parsed.data.routes).length,
  });
});
