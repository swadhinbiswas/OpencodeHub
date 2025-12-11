import { getDatabase, schema } from "@/db";
import { validateBasicAuth } from "@/lib/auth-basic";
import { getLfsObjectPath } from "@/lib/lfs";
import { canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import fs from "fs";

export const POST: APIRoute = async ({ params, request }) => {
  const { owner: ownerName, repo: repoName } = params;
  if (!ownerName || !repoName)
    return new Response("Not Found", { status: 404 });

  const db = getDatabase();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!user) return new Response("Not Found", { status: 404 });

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, user.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repoData) return new Response("Not Found", { status: 404 });

  const authHeader = request.headers.get("Authorization");
  let userId: string | null = null;
  if (authHeader) {
    userId = await validateBasicAuth(authHeader);
  }

  if (!(await canWriteRepo(userId ?? undefined, repoData))) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="OpenCodeHub"' },
    });
  }

  let body: { oid: string; size: number };
  try {
    body = await request.json();
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const objectPath = getLfsObjectPath(repoData.diskPath, body.oid);
  if (!fs.existsSync(objectPath)) {
    return new Response("Object Not Found", { status: 404 });
  }

  const stat = await fs.promises.stat(objectPath);
  if (stat.size !== body.size) {
    return new Response("Size Mismatch", { status: 422 });
  }

  return new Response(null, { status: 200 });
};
