import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { communityUsers } from "@/lib/db/schema";
import { hashPassword, signToken } from "@/lib/auth";
import { nanoid } from "nanoid";
import { eq, or } from "drizzle-orm";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { username, email, password } = body;

    if (!username || !email || !password) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), { status: 400 });
    }

    const db = getDb() as any;

    const existingUser = await db.query.communityUsers.findFirst({
      where: or(eq(communityUsers.username, username), eq(communityUsers.email, email))
    });

    if (existingUser) {
      return new Response(JSON.stringify({ success: false, error: "Username or email already exists" }), { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const id = nanoid();

    await db.insert(communityUsers).values({
      id,
      username,
      email,
      passwordHash,
    });

    const token = await signToken({ sub: id, username });

    cookies.set("community_session", token, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });

    return new Response(JSON.stringify({ success: true, data: { id, username } }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message || "Server error" }), { status: 500 });
  }
};
