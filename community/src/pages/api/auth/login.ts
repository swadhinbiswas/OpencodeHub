import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { communityUsers } from "@/lib/db/schema";
import { verifyPassword, signToken } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ success: false, error: "Missing email or password" }), { status: 400 });
    }

    const db = getDb() as any;

    const user = await db.query.communityUsers.findFirst({
      where: eq(communityUsers.email, email)
    });

    if (!user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid credentials" }), { status: 401 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return new Response(JSON.stringify({ success: false, error: "Invalid credentials" }), { status: 401 });
    }

    const token = await signToken({ sub: user.id, username: user.username });

    cookies.set("community_session", token, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });

    return new Response(JSON.stringify({ success: true, data: { id: user.id, username: user.username } }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message || "Server error" }), { status: 500 });
  }
};
