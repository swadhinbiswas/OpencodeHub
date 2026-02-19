import type { APIRoute } from "astro";
import { z } from "zod";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, success, unauthorized } from "@/lib/api";
import { runUserDigest } from "@/lib/chat-notifications";

const testDigestSchema = z.object({
  dryRun: z.boolean().optional(),
  period: z.enum(["daily", "weekly"]).optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
});

export const POST: APIRoute = withErrorHandler(async ({ locals, request }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = testDigestSchema.safeParse(body || {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid digest test payload");
  }

  const result = await runUserDigest({
    userId: user.id,
    dryRun: parsed.data.dryRun ?? true,
    period: parsed.data.period,
    maxRetries: parsed.data.maxRetries,
  });

  return success(result);
});
