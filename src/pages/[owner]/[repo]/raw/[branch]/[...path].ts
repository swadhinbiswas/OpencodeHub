import { getDatabase, schema } from "@/db";
import { getFileRawContent } from "@/lib/git";
import { canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const GET: APIRoute = async ({ params, locals }) => {
  const { owner: ownerName, repo: repoName, branch, path } = params;
  const db = getDatabase();

  // 1. Fetch Repo & Owner
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName!),
  });

  if (!user) return new Response("Not Found", { status: 404 });

  const repoData = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, user.id),
      eq(schema.repositories.name, repoName!)
    ),
    with: {
      owner: true,
    },
  });

  if (!repoData) return new Response("Not Found", { status: 404 });

  // Check permissions
  const currentUser = locals.user;
  const hasAccess = await canReadRepo(currentUser?.id, repoData);

  if (!hasAccess) {
    return new Response("Not Found", { status: 404 });
  }

  const currentBranch = branch || repoData.defaultBranch;
  const filePath = path || "";

  try {
    const content = await getFileRawContent(
      repoData.diskPath,
      filePath,
      currentBranch
    );

    if (!content) {
      return new Response("Not Found", { status: 404 });
    }

    // Determine content type (basic)
    let contentType = "text/plain";
    if (filePath.endsWith(".html")) contentType = "text/html";
    else if (filePath.endsWith(".css")) contentType = "text/css";
    else if (filePath.endsWith(".js")) contentType = "application/javascript";
    else if (filePath.endsWith(".json")) contentType = "application/json";
    else if (filePath.endsWith(".png")) contentType = "image/png";
    else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"))
      contentType = "image/jpeg";
    else if (filePath.endsWith(".gif")) contentType = "image/gif";
    else if (filePath.endsWith(".svg")) contentType = "image/svg+xml";
    else if (filePath.endsWith(".pdf")) contentType = "application/pdf";
    else if (filePath.endsWith(".zip")) contentType = "application/zip";
    else if (filePath.endsWith(".tar.gz")) contentType = "application/gzip";

    // If binary and not an image/pdf, force download
    const isViewable =
      contentType.startsWith("image/") ||
      contentType === "application/pdf" ||
      contentType.startsWith("text/") ||
      contentType === "application/javascript" ||
      contentType === "application/json";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": content.length.toString(),
    };

    if (!isViewable) {
      headers["Content-Disposition"] = `attachment; filename="${filePath
        .split("/")
        .pop()}"`;
      headers["Content-Type"] = "application/octet-stream";
    }

    return new Response(new Uint8Array(content), {
      status: 200,
      headers,
    });
  } catch (e) {
    console.error("Git error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
};
