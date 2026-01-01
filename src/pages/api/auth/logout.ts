import { getDatabase, schema } from "@/db";
import { type APIRoute } from "astro";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ cookies, locals, redirect }) => {
  const session = locals.session;

  // Delete session from database if it exists
  if (session) {
    try {
      const db = getDatabase();
      await db.delete(schema.sessions).where(eq(schema.sessions.id, session.id));
    } catch (e) {
      console.error("Failed to delete session:", e);
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
};

// Also support GET for simple link-based logout
export const GET: APIRoute = async (context) => {
  return POST(context);
};
