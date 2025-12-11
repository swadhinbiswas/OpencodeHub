import { getDatabase, schema } from "@/db";
import { validateBasicAuth } from "@/lib/auth-basic";
import { processLfsBatch, type LfsBatchRequest } from "@/lib/lfs";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const POST: APIRoute = async ({ params, request, url }) => {
  const { owner: ownerName, repo: repoName } = params;

  if (!ownerName || !repoName) {
    return new Response("Not Found", { status: 404 });
  }

  const db = getDatabase();

  // 1. Fetch Repo
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

  // 2. Auth Check
  const authHeader = request.headers.get("Authorization");
  let userId: string | null = null;
  if (authHeader) {
    userId = await validateBasicAuth(authHeader);
  }

  // 3. Parse Body
  let body: LfsBatchRequest;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  // 4. Check Permissions
  let hasAccess = false;
  if (body.operation === "download") {
    hasAccess = await canReadRepo(userId ?? undefined, repoData);
  } else if (body.operation === "upload") {
    hasAccess = await canWriteRepo(userId ?? undefined, repoData);
  }

  if (!hasAccess) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="OpenCodeHub"',
        "LFS-Authenticate": 'Basic realm="OpenCodeHub"',
      },
    });
  }

  // 5. Process Batch
  // Construct base URL for objects
  // e.g. https://host/owner/repo.git/info/lfs/objects
  const baseUrl = `${url.origin}/${ownerName}/${repoName}.git/info/lfs/objects`;

  const response = await processLfsBatch(repoData.diskPath, body, baseUrl);

  return new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/vnd.git-lfs+json",
    },
  });
};
