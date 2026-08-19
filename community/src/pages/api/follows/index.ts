import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { follows } from "@/lib/db/schema";
import { verifyToken } from "@/lib/auth";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { followeeType, followeeId } = await request.json();
    if (!followeeType || !followeeId) {
      return new Response(JSON.stringify({ success: false, error: "followeeType and followeeId required" }), { status: 400 });
    }

    const token = cookies.get("community_session")?.value;
    if (!token) return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401 });
    
    const user = await verifyToken(token);
    if (!user) return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401 });

    const followerId = user.sub;
    const db = getDb() as any;

    const existing = await db.query.follows.findFirst({ 
      where: and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)) 
    }).catch(() => null);

    if (existing) {
      await db.delete(follows).where(eq(follows.id, existing.id));
      return new Response(JSON.stringify({ success: true, data: { following: false } }), { headers: { "Content-Type": "application/json" } });
    }

    await db.insert(follows).values({ id: nanoid(), followerId, followeeType, followeeId });
    return new Response(JSON.stringify({ success: true, data: { following: true } }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
  }
};
