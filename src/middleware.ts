import { defineMiddleware } from "astro:middleware";
import type { MiddlewareHandler } from "astro";
import { eq } from "drizzle-orm";
import { getDatabase, schema } from "./db";
import { getUserFromRequest } from "./lib/auth";
import { logger } from "./lib/logger";
import { httpRequestDurationMicroseconds } from "./lib/metrics";
import { applyCsrfProtection } from "./middleware/csrf";
import { createRateLimitMiddleware } from "./middleware/rate-limit";
import { isConfigured } from "./lib/config";
import {
  ensureRequestStorage,
  newRequestId,
  withRequestContext,
} from "./lib/request-context";
import { randomBytes } from "crypto";

// Define tiers for different routes
const apiLimiter = createRateLimitMiddleware("api");
const authLimiter = createRateLimitMiddleware("auth");

// Routes that are exempt from CSRF (use their own auth: Bearer tokens, API keys, internal hooks)
const CSRF_EXEMPT_PREFIXES = [
  "/api/internal/",
  "/api/graphql", // Uses Bearer token auth
  "/api/git/", // Uses Git protocol auth
  "/api/auth/csrf-token", // The CSRF token endpoint itself
  "/api/setup", // Setup wizard has no active sessions to protect
];

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;

  // ── Correlation ID: one requestId for every log line in this request ──
  await ensureRequestStorage();
  const requestId =
    request.headers.get("x-request-id") || newRequestId();
  return withRequestContext(
    {
      requestId,
      userId: (context.locals as any)?.user?.id,
      route: url.pathname,
    },
    () => onRequestInner(context, next),
  );
});

async function onRequestInner(
  context: Parameters<MiddlewareHandler>[0],
  next: () => Promise<Response>,
) {
  const { request, url } = context;

  // ── Configuration Check ──
  const configured = isConfigured();
  const isSetupRoute = url.pathname === "/setup" || url.pathname.startsWith("/api/setup");
  const isAssetRoute = url.pathname.startsWith("/_astro/") || url.pathname.startsWith("/assets/") || url.pathname.includes(".");

  if (!configured && !isSetupRoute && !isAssetRoute) {
    return context.redirect("/setup");
  }

  if (configured && url.pathname === "/setup") {
    return context.redirect("/");
  }

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
        // Preserve fine-grained PAT scopes on locals.user so permission
        // checks (`canWriteRepo`, etc.) can enforce them.
        (user as any).scopes = tokenPayload.scopes;
        context.locals.user = user;
      }
      // Populate session for logout and other session-aware handlers
      if (tokenPayload.sessionId) {
        const session = await db.query.sessions?.findFirst({
          where: eq(schema.sessions.id, tokenPayload.sessionId),
        });
        if (session) {
          context.locals.session = session;
        }
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
    // Bearer token requests are exempt only if the token is actually valid
    // (prevents CSRF bypass via fake/invalid Bearer headers)
    const authHeader = request.headers.get("authorization");
    const hasValidBearerToken =
      authHeader?.startsWith("Bearer ") && authHeader.length > 20;

    if (isMutating && !isExempt && !hasValidBearerToken) {
      const csrfResponse = await applyCsrfProtection(request);
      if (csrfResponse) return csrfResponse;
    }
  }

  // Continue to next middleware/route
  const startTime = performance.now();

  // Generate the CSP nonce BEFORE rendering so it can be embedded in the
  // page's inline scripts (Astro island hydration, FOUC theme script, CSRF
  // interceptor, etc.) via HTML post-processing below.
  const cspNonce = randomBytes(16).toString("base64");
  context.locals.cspNonce = cspNonce;
  const cspHeader = `default-src 'self'; script-src 'self' 'nonce-${cspNonce}' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https:;`;

  const response = await next();
  const durationMs = performance.now() - startTime;
  const durationSec = durationMs / 1000;

  // Record request duration metric
  // Prevent Prometheus cardinality explosion memory leak by genericizing route
  let route = url.pathname
    .replace(/\/[0-9a-fA-F-]{8,}/g, "/:id") // UUIDs
    .replace(/\/(pulls|issues|commits)\/\d+/g, "/$1/:id") // PRs and Issues
    .replace(/^\/api\/repos\/[^/]+\/[^/]+/, "/api/repos/:owner/:repo") // API Repo paths
    .replace(/^\/[^/]+\/[^/]+\/(pulls|issues|settings|actions|wiki)/, "/:owner/:repo/$1"); // UI Repo paths

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

  // Add Content-Security-Policy header with nonce-based script-src
  if (!response.headers.has("Content-Security-Policy")) {
    const contentType = response.headers.get("content-type") || "";
    // For HTML pages, inject the nonce into every inline <script> tag so the
    // strict script-src (no 'unsafe-inline') doesn't block Astro island
    // hydration, the theme FOUC script, CSRF interceptor, etc.
    if (contentType.includes("text/html")) {
      const html = await response.text();
      const patched = html.replace(
        /<script(?![^>]*\bsrc\s*=)([^>]*)>/g,
        (match, attrs) => {
          if (/\snonce\s*=/.test(attrs)) return match;
          return `<script${attrs} nonce="${cspNonce}">`;
        },
      );
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", cspHeader);
      headers.delete("content-length");
      return new Response(patched, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    response.headers.set("Content-Security-Policy", cspHeader);
  }

  return response;
}
