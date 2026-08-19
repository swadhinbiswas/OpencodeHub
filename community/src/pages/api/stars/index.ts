import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { stars, cachedRepos } from "@/lib/db/schema";
import { verifyToken } from "@/lib/auth";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { repoId, fullName } = body;
    if (!repoId && !fullName) {
      return new Response(JSON.stringify({ success: false, error: "repoId or fullName required" }), { status: 400 });
    }

    const token = cookies.get("community_session")?.value;
    if (!token) return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401 });
    
    const user = await verifyToken(token);
    if (!user) return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401 });
    
    const userId = user.sub;
    const db = getDb() as any;

    let targetId = repoId;
    if (!targetId && fullName) {
      const repo = await db.query.cachedRepos.findFirst({ where: eq(cachedRepos.fullName, fullName) }).catch(() => null);
      targetId = repo?.id;
      if (!targetId) return new Response(JSON.stringify({ success: false, error: "Repo not cached yet — sync the instance first" }), { status: 404 });
    }

    const existing = await db.query.stars.findFirst({ where: and(eq(stars.userId, userId), eq(stars.repoId, targetId)) }).catch(() => null);
    if (existing) {
      await db.delete(stars).where(and(eq(stars.userId, userId), eq(stars.repoId, targetId)));
      return new Response(JSON.stringify({ success: true, data: { starred: false } }), { headers: { "Content-Type": "application/json" } });
    }
    
    await db.insert(stars).values({ id: nanoid(), userId, repoId: targetId });
    return new Response(JSON.stringify({ success: true, data: { starred: true } }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
  }
};

export const GET: APIRoute = async ({ url }) => {
  const repoId = url.searchParams.get("repoId");
  const db = getDb() as any;
  const count = await db.query.stars.findMany({ where: repoId ? eq(stars.repoId, repoId) : undefined }).catch(()=>[]);
  return new Response(JSON.stringify({ success: true, data: { count: count.length } }), { headers: { "Content-Type": "application/json" } });
};
