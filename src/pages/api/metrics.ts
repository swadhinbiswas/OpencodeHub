import { register } from "@/lib/metrics";
import { timingSafeEqual } from "crypto";
import type { APIRoute } from "astro";
import { withErrorHandler } from "@/lib/errors";

function isAuthorized(request: Request): boolean {
  const expected = process.env.METRICS_TOKEN;
  // When unset, the endpoint is public only outside production (handled in
  // GET below). In production METRICS_TOKEN must be configured; also restrict
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
  // Deny by default in production: scraping metrics requires METRICS_TOKEN.
  // Non-production stays public when unset (dev convenience).
  if (!process.env.METRICS_TOKEN && process.env.NODE_ENV === "production") {
    return new Response(
      JSON.stringify({ error: "METRICS_TOKEN must be set in production" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

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
