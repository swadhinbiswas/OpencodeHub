import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
export const prerender = false;
export const GET: APIRoute = async () => {
  try {
    const db = getDb() as any;
    const rows = await db.query.instances.findMany?.().catch(()=>[]) || [];
    return new Response(JSON.stringify({ success: true, data: rows }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: true, data: [] }), { headers: { "Content-Type": "application/json" } });
  }
};
