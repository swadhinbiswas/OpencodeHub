import { register } from "@/lib/metrics";
import { timingSafeEqual } from "crypto";
import type { APIRoute } from "astro";
import { withErrorHandler } from "@/lib/errors";

function isAuthorized(request: Request): boolean {
  const expected = process.env.METRICS_TOKEN;
  // When no token is configured the endpoint stays public (e.g. air-gapped
  // single-host installs). For production, set METRICS_TOKEN and restrict
  // network access in the reverse proxy.
  if (!expected) return true;

  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const GET: APIRoute = withErrorHandler(async ({ request }) => {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const metrics = await register.metrics();
  return new Response(metrics, {
    headers: {
      "Content-Type": register.contentType,
    },
  });
});
