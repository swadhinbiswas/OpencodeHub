import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { cachedRepos, cachedUsers } from "@/lib/db/schema";
import { like, or } from "drizzle-orm";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const q = url.searchParams.get("q") || "";
    if (!q || q.length < 2) {
      return new Response(JSON.stringify({ success: true, data: { repos: [], users: [] } }), { status: 200 });
    }

    const db = getDb() as any;
    const searchPattern = `%${q}%`;

    const repos = await db.query.cachedRepos.findMany({
      where: or(
        like(cachedRepos.fullName, searchPattern),
        like(cachedRepos.description, searchPattern)
      ),
      limit: 10,
      with: { instance: true }
    });

    const users = await db.query.cachedUsers.findMany({
      where: or(
        like(cachedUsers.username, searchPattern),
        like(cachedUsers.displayName, searchPattern)
      ),
      limit: 5,
      with: { instance: true }
    });

    return new Response(JSON.stringify({ success: true, data: { repos, users } }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
};
