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
          }
        }
      }
    } catch (e) {
      // Invalid token or session
      context.cookies.delete("och_session", { path: "/" });
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

  /*
  // 2FA Enforcement for Admins
  if (context.locals.user?.isAdmin && !context.locals.user.twoFactorEnabled) {
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
      return context.redirect("/settings/security");
    }
  }
  */

  // Redirect logged-in users away from auth pages
  const authRoutes = ["/login", "/register"];
  if (authRoutes.includes(context.url.pathname) && context.locals.user) {
    return context.redirect("/dashboard");
  }

  return next();
});
