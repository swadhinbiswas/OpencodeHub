import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { stars, cachedRepos } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
export const prerender = false;
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { repoId, fullName } = body;
    if (!repoId && !fullName) return new Response(JSON.stringify({ success: false, error: { message: "repoId or fullName required" } }), { status: 400 });
    // For demo, use a mock community user if no auth (in production, require JWT)
    const userId = cookies.get("community_user")?.value || "demo-user";
    const db = getDb() as any;
    // Ensure demo user exists
    try { await db.insert((await import("@/lib/db/schema")).communityUsers).values({ id: userId, username: "demo", email: "demo@community.local", passwordHash: "demo" }).onConflictDoNothing(); } catch {}
    let targetId = repoId;
    if (!targetId && fullName) {
      const repo = await db.query.cachedRepos.findFirst({ where: eq(cachedRepos.fullName, fullName) }).catch(()=>null);
      targetId = repo?.id;
      if (!targetId) return new Response(JSON.stringify({ success: false, error: { message: "Repo not cached yet — sync the instance first" } }), { status: 404 });
    }
    const existing = await db.query.stars.findFirst({ where: and(eq(stars.userId, userId), eq(stars.repoId, targetId)) }).catch(()=>null);
    if (existing) {
      await db.delete(stars).where(and(eq(stars.userId, userId), eq(stars.repoId, targetId)));
      return new Response(JSON.stringify({ success: true, data: { starred: false } }), { headers: { "Content-Type": "application/json" } });
    }
    await db.insert(stars).values({ id: nanoid(), userId, repoId: targetId });
    return new Response(JSON.stringify({ success: true, data: { starred: true } }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500 });
  }
};
export const GET: APIRoute = async ({ url }) => {
  const repoId = url.searchParams.get("repoId");
  const db = getDb() as any;
  const count = await db.query.stars.findMany({ where: repoId ? eq(stars.repoId, repoId) : undefined }).catch(()=>[]);
  return new Response(JSON.stringify({ success: true, data: { count: count.length } }), { headers: { "Content-Type": "application/json" } });
};
