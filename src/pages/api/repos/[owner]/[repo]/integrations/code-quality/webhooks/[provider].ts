import type { APIRoute } from "astro";
import { badRequest, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { handleQualityWebhook, QUALITY_PROVIDERS } from "@/lib/code-quality";
import { isAirGappedMode } from "@/lib/air-gapped";

export const POST: APIRoute = withErrorHandler(async ({ params, request, url }) => {
  if (isAirGappedMode()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "AIR_GAPPED_MODE",
          message: "Code quality webhooks are disabled because AIR_GAPPED_MODE is enabled",
        },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const provider = params.provider;
  if (!provider) return badRequest("Missing provider");
  if (!(provider in QUALITY_PROVIDERS)) return badRequest("Unsupported provider");

  const webhookSecret =
    request.headers.get("x-webhook-secret") ||
    request.headers.get("x-opencodehub-webhook-secret") ||
    url.searchParams.get("secret");

  if (!webhookSecret) {
    return unauthorized("Missing webhook secret");
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return badRequest("Invalid webhook payload");
  }

  const handled = await handleQualityWebhook(provider, webhookSecret, payload as Record<string, unknown>);
  if (!handled) {
    return unauthorized("Invalid webhook credentials or payload");
  }

  return success({ ok: true });
});
