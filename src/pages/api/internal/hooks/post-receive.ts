import { getDatabase, schema } from "@/db";
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ request, url }) => {
  const repoPath = url.searchParams.get("repo");
  if (!repoPath) {
    return new Response("Missing repo path", { status: 400 });
  }

  let body: { oldrev: string; newrev: string; refname: string };
  try {
    body = await request.json();
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  console.log(
    `[Post-Receive] Repo: ${repoPath}, Ref: ${body.refname}, Old: ${body.oldrev}, New: ${body.newrev}`
  );

  const db = getDatabase();

  // Find repo by diskPath
  // Note: repoPath from hook might differ slightly (e.g. trailing slash), so we might need to normalize.
  // But for now let's try exact match.
  const repo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.diskPath, repoPath),
  });

  if (!repo) {
    console.error(`[Post-Receive] Repo not found in DB: ${repoPath}`);
    return new Response("Repo not found", { status: 404 });
  }

  // Update repo updatedAt
  await db
    .update(schema.repositories)
    .set({ updatedAt: new Date() })
    .where(eq(schema.repositories.id, repo.id));

  // TODO: Trigger Webhooks
  // TODO: Trigger CI/CD

  return new Response("OK", { status: 200 });
};
