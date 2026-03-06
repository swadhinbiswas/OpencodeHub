import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, success, unauthorized, parseBody } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { runUserDigest } from "@/lib/chat-notifications";
import { generateId } from "@/lib/utils";

const retrySchema = z.object({
  period: z.enum(["daily", "weekly"]).optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
  dryRun: z.boolean().optional(),
});

export const POST: APIRoute = withErrorHandler(async ({ locals, request }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const parsed = await parseBody(request, retrySchema);
  if ("error" in parsed) return parsed.error;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const digestSettings = await db.query.emailDigestSettings.findFirst({
    where: eq(schema.emailDigestSettings.userId, user.id),
  });

  if (!digestSettings) {
    return badRequest("Digest settings are not configured for this user");
  }

  const result = await runUserDigest({
    userId: user.id,
    period: parsed.data.period,
    maxRetries: parsed.data.maxRetries,
    dryRun: parsed.data.dryRun ?? false,
  });

  await db.insert(schema.auditLogs).values({
    id: generateId(),
    userId: user.id,
    action: "notification_digest_dead_letter_retry_requested",
    actorType: "user",
    actorId: user.id,
    targetType: "notification_digest",
    targetId: digestSettings.id,
    data: JSON.stringify({
      period: parsed.data.period || null,
      dryRun: parsed.data.dryRun ?? false,
      maxRetries: parsed.data.maxRetries ?? null,
      result,
    }),
    createdAt: new Date(),
  });

  return success({
    retried: true,
    result,
  });
});
