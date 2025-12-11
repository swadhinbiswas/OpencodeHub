import { getDatabase, schema } from "@/db";
import { type APIRoute } from "astro";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ cookies, locals, redirect }) => {
  const session = locals.session;

  if (session) {
    const db = getDatabase();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, session.id));
  }

  cookies.delete("och_session", { path: "/" });

  return redirect("/login");
};
