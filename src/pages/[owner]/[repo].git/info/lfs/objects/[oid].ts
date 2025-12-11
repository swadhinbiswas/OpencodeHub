import { getDatabase, schema } from "@/db";
import { validateBasicAuth } from "@/lib/auth-basic";
import { ensureLfsStorage, getLfsObjectPath } from "@/lib/lfs";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

// Helper to get repo and user
async function getRepoContext(
  ownerName: string,
  repoName: string,
  authHeader: string | null
) {
  const db = getDatabase();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!user) return null;

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, user.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repoData) return null;

  let userId: string | null = null;
  if (authHeader) {
    userId = await validateBasicAuth(authHeader);
  }

  return { repoData, userId };
}

export const GET: APIRoute = async ({ params, request }) => {
  const { owner: ownerName, repo: repoName, oid } = params;
  if (!ownerName || !repoName || !oid)
    return new Response("Not Found", { status: 404 });

  const ctx = await getRepoContext(
    ownerName,
    repoName,
    request.headers.get("Authorization")
  );
  if (!ctx) return new Response("Not Found", { status: 404 });
  const { repoData, userId } = ctx;

  if (!(await canReadRepo(userId ?? undefined, repoData))) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="OpenCodeHub"' },
    });
  }

  const objectPath = getLfsObjectPath(repoData.diskPath, oid);
  if (!fs.existsSync(objectPath)) {
    return new Response("Object Not Found", { status: 404 });
  }

  const stat = await fs.promises.stat(objectPath);
  const stream = fs.createReadStream(objectPath);

  return new Response(Readable.toWeb(stream) as any, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": stat.size.toString(),
    },
  });
};

export const PUT: APIRoute = async ({ params, request }) => {
  const { owner: ownerName, repo: repoName, oid } = params;
  if (!ownerName || !repoName || !oid)
    return new Response("Not Found", { status: 404 });

  const ctx = await getRepoContext(
    ownerName,
    repoName,
    request.headers.get("Authorization")
  );
  if (!ctx) return new Response("Not Found", { status: 404 });
  const { repoData, userId } = ctx;

  if (!(await canWriteRepo(userId ?? undefined, repoData))) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="OpenCodeHub"' },
    });
  }

  await ensureLfsStorage(repoData.diskPath);
  const objectPath = getLfsObjectPath(repoData.diskPath, oid);

  // Ensure parent directory exists
  await fs.promises.mkdir(path.dirname(objectPath), { recursive: true });

  if (request.body) {
    // @ts-ignore
    const fileStream = fs.createWriteStream(objectPath);
    // @ts-ignore
    await pipeline(request.body, fileStream);
  } else {
    return new Response("Body required", { status: 400 });
  }

  return new Response(null, { status: 200 });
};
