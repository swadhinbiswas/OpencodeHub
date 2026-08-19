import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { follows } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
export const prerender = false;
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { followeeType, followeeId } = await request.json();
    if (!followeeType || !followeeId) return new Response(JSON.stringify({ success: false, error: { message: "followeeType and followeeId required" } }), { status: 400 });
    const followerId = cookies.get("community_user")?.value || "demo-user";
    const db = getDb() as any;
    try { const { communityUsers } = await import("@/lib/db/schema"); await db.insert(communityUsers).values({ id: followerId, username: "demo", email: "demo@community.local", passwordHash: "demo" }).onConflictDoNothing(); } catch {}
    const existing = await db.query.follows.findFirst({ where: and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)) }).catch(()=>null);
    if (existing) {
      await db.delete(follows).where(eq(follows.id, existing.id));
      return new Response(JSON.stringify({ success: true, data: { following: false } }), { headers: { "Content-Type": "application/json" } });
    }
    await db.insert(follows).values({ id: nanoid(), followerId, followeeType, followeeId });
    return new Response(JSON.stringify({ success: true, data: { following: true } }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500 });
  }
};
