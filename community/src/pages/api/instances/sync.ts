import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { instances, cachedRepos } from "@/lib/db/schema";
import { fetchAllPublicRepos } from "@/lib/instance-client";
import { cacheGet, cacheSet } from "@/lib/cache";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
export const prerender = false;
export const POST: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("id");
  if (!id) return new Response(JSON.stringify({ success: false, error: { message: "id required" } }), { status: 400 });
  const db = getDb() as any;
  const instance = await db.query.instances.findFirst({ where: eq(instances.id, id) }).catch(()=>null);
  if (!instance) return new Response(JSON.stringify({ success: false, error: { message: "Instance not found" } }), { status: 404 });
  const cached = await cacheGet<any>(`sync:${id}`);
  if (cached) return new Response(JSON.stringify({ success: true, data: cached, cached: true }), { headers: { "Content-Type": "application/json" } });
  try {
    const repos = await fetchAllPublicRepos(instance.url);
    // Upsert cached repos
    for (const r of repos) {
      const existing = await db.query.cachedRepos.findFirst({ where: eq(cachedRepos.remoteId, r.id) }).catch(()=>null);
      if (existing) {
        await db.update(cachedRepos).set({ fullName: r.fullName, name: r.name, description: r.description, language: r.language, topics: JSON.stringify(r.topics), starCount: r.starCount, forkCount: r.forkCount, httpCloneUrl: r.httpCloneUrl, updatedAt: r.updatedAt }).where(eq(cachedRepos.id, existing.id));
      } else {
        await db.insert(cachedRepos).values({ id: nanoid(), instanceId: id, remoteId: r.id, fullName: r.fullName, name: r.name, ownerUsername: r.owner.username, ownerDisplayName: r.owner.displayName, ownerAvatarUrl: r.owner.avatarUrl, description: r.description, visibility: r.visibility, language: r.language, topics: JSON.stringify(r.topics), starCount: r.starCount, forkCount: r.forkCount, httpCloneUrl: r.httpCloneUrl, updatedAt: r.updatedAt });
      }
    }
    await db.update(instances).set({ repoCount: repos.length, status: "online", lastSyncAt: new Date().toISOString() }).where(eq(instances.id, id));
    const result = { repos, count: repos.length };
    await cacheSet(`sync:${id}`, result, 300);
    return new Response(JSON.stringify({ success: true, data: result }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    await db.update(instances).set({ status: "error" }).where(eq(instances.id, id)).catch(()=>{});
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500 });
  }
};
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("id");
  const db = getDb() as any;
  if (id) {
    const rows = await db.query.cachedRepos.findMany({ where: eq(cachedRepos.instanceId, id) }).catch(()=>[]);
    return new Response(JSON.stringify({ success: true, data: rows }), { headers: { "Content-Type": "application/json" } });
  }
  const all = await db.query.cachedRepos.findMany().catch(()=>[]);
  return new Response(JSON.stringify({ success: true, data: all }), { headers: { "Content-Type": "application/json" } });
};
