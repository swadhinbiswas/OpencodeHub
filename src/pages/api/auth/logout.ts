import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { type APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/errors";

export const POST: APIRoute = withErrorHandler(async ({ cookies, locals, redirect }) => {
  const session = locals.session;

  // Delete session from database if it exists
  if (session) {
    try {
      const db = getDatabase() as NodePgDatabase<typeof schema>;
      await db.delete(schema.sessions).where(eq(schema.sessions.id, session.id));
      logger.info({ sessionId: session.id }, "Session deleted");
    } catch (e) {
      logger.error({ err: e }, "Failed to delete session");
    }
  }

  // Clear the session cookie with all attributes to ensure proper deletion
  cookies.delete("och_session", {
    path: "/",
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax"
  });

  // Also clear any legacy auth cookie if it exists
  cookies.delete("auth_token", { path: "/" });

  return redirect("/login", 302);
});

// Also support GET for simple link-based logout
export const GET: APIRoute = POST;
