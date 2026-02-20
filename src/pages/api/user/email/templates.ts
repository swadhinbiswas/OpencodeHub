import type { APIRoute } from "astro";
import { z } from "zod";
import { badRequest, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { listEmailTemplates, renderEmailTemplate } from "@/lib/email-notification-templates";

const previewSchema = z.object({
  templateId: z.enum(["test", "digest_daily", "digest_weekly", "pr_opened", "issue_opened"]),
  variables: z.record(z.union([z.string(), z.number()])).optional(),
});

export const GET: APIRoute = withErrorHandler(async ({ locals }) => {
  if (!locals.user) return unauthorized();

  return success({
    templates: listEmailTemplates(),
  });
});

export const POST: APIRoute = withErrorHandler(async ({ locals, request }) => {
  if (!locals.user) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = previewSchema.safeParse(body || {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid template preview payload");
  }

  const preview = renderEmailTemplate(parsed.data.templateId, parsed.data.variables || {});
  if (!preview) {
    return badRequest("Unknown template");
  }

  return success({
    preview,
  });
});
