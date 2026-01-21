import { getDatabase, schema } from "@/db";
import { verifyToken } from "@/lib/auth";
import { initTracing } from "@/lib/tracing";
import { defineMiddleware } from "astro:middleware";
import { eq } from "drizzle-orm";

// Initialize tracing
initTracing();

export const onRequest = defineMiddleware(async (context, next) => {
  const token = context.cookies.get("och_session")?.value;

  if (token) {
    try {
      const payload = await verifyToken(token);

      if (payload && payload.userId) {
        const db = getDatabase();

        // Verify session in database
        // If sessionId is present in payload, use it. Otherwise fall back to token check (legacy/fallback)
        const session = payload.sessionId
          ? await db.query.sessions.findFirst({
            where: eq(schema.sessions.id, payload.sessionId),
          })
          : await db.query.sessions.findFirst({
            where: eq(schema.sessions.token, token),
          });

        if (session && new Date(session.expiresAt) > new Date()) {
          // Fetch user
          const user = await db.query.users.findFirst({
            where: eq(schema.users.id, payload.userId),
          });

          if (user) {
            context.locals.user = user;
            context.locals.session = session;
            console.log(`[Middleware] Authenticated user: ${user.username} (${user.id})`);
          } else {
            console.log(`[Middleware] User not found for ID: ${payload.userId}`);
          }
        } else {
          console.log(`[Middleware] Session invalid or expired. Session: ${!!session}, Expired: ${session && new Date(session.expiresAt) <= new Date()}`);
        }
      } else {
        console.log(`[Middleware] Invalid payload or missing userId: ${JSON.stringify(payload)}`);
      }
    } catch (e) {
      console.error(`[Middleware] Error verifying token:`, e);
      // Invalid token or session
      context.cookies.delete("och_session", { path: "/" });
    }
  } else {
    // Only log warning for non-git requests, as git uses Basic Auth handled by backend
    if (!context.url.pathname.endsWith(".git") && !context.url.pathname.includes(".git/")) {
      console.log(`[Middleware] No token found for request: ${context.url.pathname}`);
    }
  }

  // Protected routes logic
  const protectedRoutes = ["/dashboard", "/settings", "/new"];
  const isProtectedRoute = protectedRoutes.some((route) =>
    context.url.pathname.startsWith(route)
  );

  if (isProtectedRoute && !context.locals.user) {
    return context.redirect("/login");
  }

  // 2FA Recommendation for Admins (non-blocking)
  // Instead of enforcing 2FA on ALL routes, only block access to sensitive admin routes
  // and show a warning on other pages (handled by UI components)
  if (context.locals.user?.isAdmin && !context.locals.user.twoFactorEnabled) {
    // Only enforce 2FA on sensitive admin operations, not general browsing
    const sensitiveAdminRoutes = [
      "/admin/users",
      "/admin/settings",
      "/api/admin/users",
      "/api/admin/settings",
    ];

    const isSensitiveRoute = sensitiveAdminRoutes.some((route) =>
      context.url.pathname.startsWith(route)
    );

    // Only redirect on sensitive routes, allow browsing elsewhere
    if (isSensitiveRoute) {
      const allowedPaths = [
        "/settings/security",
        "/api/auth/2fa",
        "/api/auth/logout",
        "/_astro",
        "/favicon.ico",
      ];

      const isAllowed = allowedPaths.some((path) =>
        context.url.pathname.startsWith(path)
      );

      if (!isAllowed) {
        return context.redirect("/settings/security?require2fa=true");
      }
    }
  }

  // Redirect logged-in users away from auth pages
  const authRoutes = ["/login", "/register"];
  if (authRoutes.includes(context.url.pathname) && context.locals.user) {
    return context.redirect("/dashboard");
  }

  return next();
});
