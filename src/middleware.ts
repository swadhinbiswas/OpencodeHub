import { defineMiddleware } from "astro:middleware";
import { eq } from "drizzle-orm";
import { getDatabase, schema } from "./db";
import { getUserFromRequest } from "./lib/auth";
import { logger } from "./lib/logger";
import { httpRequestDurationMicroseconds } from "./lib/metrics";
import { applyCsrfProtection } from "./middleware/csrf";
import { createRateLimitMiddleware } from "./middleware/rate-limit";

// Define tiers for different routes
const apiLimiter = createRateLimitMiddleware("api");
const authLimiter = createRateLimitMiddleware("auth");

// Routes that are exempt from CSRF (use their own auth: Bearer tokens, API keys, internal hooks)
const CSRF_EXEMPT_PREFIXES = [
  "/api/internal/",
  "/api/graphql", // Uses Bearer token auth
  "/api/git/", // Uses Git protocol auth
  "/api/auth/csrf-token", // The CSRF token endpoint itself
];

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;

  // ── Populate Astro.locals.user from session cookie or Bearer token ──
  context.locals.user = null;
  context.locals.session = null;

  try {
    const tokenPayload = await getUserFromRequest(request);
    if (tokenPayload?.userId) {
      const db = getDatabase();
      const user = await db.query.users?.findFirst({
        where: eq(schema.users.id, tokenPayload.userId),
      });
      if (user) {
        context.locals.user = user;
      }
    }
  } catch {
    // Auth failures are non-fatal — user stays null (anonymous)
  }

  // Apply rate limiting to API routes
  if (url.pathname.startsWith("/api/")) {
    // Use stricter auth limits for auth routes
    if (url.pathname.startsWith("/api/auth")) {
      const response = await authLimiter(request, context);
      if (response) return response;
    } else {
      const response = await apiLimiter(request, context);
      if (response) return response;
    }

    // Apply CSRF protection on state-changing API requests
    const method = request.method.toUpperCase();
    const isMutating = !["GET", "HEAD", "OPTIONS"].includes(method);
    const isExempt = CSRF_EXEMPT_PREFIXES.some((p) =>
      url.pathname.startsWith(p),
    );
    // Bearer token requests are exempt (stateless API auth)
    const hasBearerToken = request.headers
      .get("authorization")
      ?.startsWith("Bearer ");

    if (isMutating && !isExempt && !hasBearerToken) {
      const csrfResponse = await applyCsrfProtection(request);
      if (csrfResponse) return csrfResponse;
    }
  }

  // Continue to next middleware/route
  const startTime = performance.now();
  const response = await next();
  const durationMs = performance.now() - startTime;
  const durationSec = durationMs / 1000;

  // Record request duration metric
  const route = url.pathname.replace(/\/[0-9a-f-]{8,}/g, "/:id");
  httpRequestDurationMicroseconds
    .labels(request.method, route, String(response.status))
    .observe(durationSec);

  // Log slow requests (>500ms)
  if (durationMs > 500) {
    logger.warn(
      {
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs: Math.round(durationMs),
      },
      "Slow request detected",
    );
  }

  // Add Server-Timing header for observability
  response.headers.set("Server-Timing", `total;dur=${durationMs.toFixed(1)}`);

  // Add Content-Security-Policy header
  if (!response.headers.has("Content-Security-Policy")) {
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'",
    );
  }

  return response;
});
