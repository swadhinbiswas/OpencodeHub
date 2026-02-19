import type { APIRoute } from "astro";
import { z } from "zod";
import { badRequest, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { isSmtpConfigured, sendTestEmail } from "@/lib/email";

const testEmailSchema = z.object({
  dryRun: z.boolean().optional(),
  to: z.string().email().optional(),
});

export const POST: APIRoute = withErrorHandler(async ({ locals, request }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = testEmailSchema.safeParse(body || {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid test email payload");
  }

  const dryRun = parsed.data.dryRun ?? true;
  const to = parsed.data.to || user.email;
  if (!to) {
    return badRequest("No destination email available");
  }

  const sent = await sendTestEmail({ to, dryRun });

  return success({
    sent,
    dryRun,
    to,
    smtpConfigured: isSmtpConfigured(),
  });
});
