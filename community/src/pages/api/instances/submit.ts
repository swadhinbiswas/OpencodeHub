import type { APIRoute } from "astro";
import { probeInstance, fetchPublicRepos } from "@/lib/instance-client";
import { getDb } from "@/lib/db";
import { instances } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { cacheSet } from "@/lib/cache";
import { eq } from "drizzle-orm";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const rawUrl = (body.url || "").trim();
    if (!rawUrl) return new Response(JSON.stringify({ success: false, error: { message: "URL is required" } }), { status: 400, headers: { "Content-Type": "application/json" } });
    let origin: string;
    try { origin = new URL(rawUrl).origin; } catch { return new Response(JSON.stringify({ success: false, error: { message: "Invalid URL" } }), { status: 400, headers: { "Content-Type": "application/json" } }); }

    const probe = await probeInstance(origin);
    if (!probe.ok) return new Response(JSON.stringify({ success: false, error: { message: probe.error } }), { status: 400, headers: { "Content-Type": "application/json" } });

    const info = probe.info;
    const db = getDb() as any;

    let id: string;
    // try find existing
    let existing: any = null;
    try { existing = await db.query.instances.findFirst({ where: eq(instances.url, origin) }); } catch {}
    if (existing) {
      id = existing.id;
      await db.update(instances).set({ siteUrl: info.siteUrl, name: info.name, version: info.version, capabilities: JSON.stringify(info.capabilities), status: "online", lastSyncAt: new Date().toISOString() }).where(eq(instances.id, id));
    } else {
      id = nanoid();
      await db.insert(instances).values({ id, url: origin, siteUrl: info.siteUrl, name: info.name, version: info.version, capabilities: JSON.stringify(info.capabilities), status: "online", lastSyncAt: new Date().toISOString() });
    }

    let repoCount = 0;
    try {
      const { repos } = await fetchPublicRepos(origin, 1, 5);
      repoCount = repos.length;
      await cacheSet(`instance:${id}:probe`, info, 3600);
    } catch {}

    return new Response(JSON.stringify({ success: true, data: { id, ...info, repoCount } }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message || "Server error" } }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
