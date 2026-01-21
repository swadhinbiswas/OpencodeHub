import { getDatabase, schema } from "@/db";
import { validateBasicAuth } from "@/lib/auth-basic";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { resolveRepoPath, releaseRepo, parseStoragePath } from "@/lib/git-storage";
import type { APIRoute } from "astro";
import { spawn } from "child_process";
import { and, eq } from "drizzle-orm";
import { PassThrough, Readable } from "stream";

export const ALL: APIRoute = async ({ params, request }) => {
  const { owner: ownerName, repo: repoName, path } = params;

  if (!ownerName || !repoName || !path) {
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

  // 3. Handle Routes
  const url = new URL(request.url);
  const service = url.searchParams.get("service");

  // Get local path (downloads from R2 if needed)
  let localRepoPath: string;
  try {
    localRepoPath = await resolveRepoPath(repoData.diskPath);
  } catch (err) {
    console.error("Failed to resolve repo path:", err);
    return new Response("Internal Server Error", { status: 500 });
  }

  // --- info/refs ---
  if (path === "info/refs") {
    if (!service)
      return new Response("Dumb HTTP protocol not supported", { status: 403 });

    const isUpload = service === "git-upload-pack";
    const isReceive = service === "git-receive-pack";

    if (!isUpload && !isReceive)
      return new Response("Forbidden", { status: 403 });

    // Check permissions
    let hasAccess = false;
    if (isUpload) {
      hasAccess = await canReadRepo(userId || undefined, repoData);
    } else {
      hasAccess = await canWriteRepo(userId || undefined, repoData);
    }

    if (!hasAccess) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="OpenCodeHub"' },
      });
    }

    const cmd = service.replace("git-", "");
    const child = spawn("git", [
      cmd,
      "--stateless-rpc",
      "--advertise-refs",
      localRepoPath,
    ]);

    const stream = new PassThrough();

    // Packet line
    const serviceLine = `# service=${service}\n`;
    const len = (serviceLine.length + 4).toString(16).padStart(4, "0");
    stream.write(`${len}${serviceLine}0000`);

    child.stdout.pipe(stream);

    // Log errors
    child.stderr.on("data", (data) => {
      console.error(`Git error (${service}):`, data.toString());
    });

    return new Response(stream as any, {
      headers: {
        "Content-Type": `application/x-${service}-advertisement`,
        "Cache-Control": "no-cache",
      },
    });
  }

  // --- git-upload-pack / git-receive-pack ---
  if (path === "git-upload-pack" || path === "git-receive-pack") {
    if (request.method !== "POST")
      return new Response("Method Not Allowed", { status: 405 });

    const isUpload = path === "git-upload-pack";

    // Check permissions
    let hasAccess = false;
    if (isUpload) {
      hasAccess = await canReadRepo(userId || undefined, repoData);
    } else {
      hasAccess = await canWriteRepo(userId || undefined, repoData);
    }

    if (!hasAccess) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="OpenCodeHub"' },
      });
    }

    const cmd = path.replace("git-", "");
    const child = spawn("git", [cmd, "--stateless-rpc", localRepoPath]);

    if (request.body) {
      // Convert Web Stream to Node Stream
      const nodeStream = Readable.fromWeb(request.body as any);
      nodeStream.pipe(child.stdin);
    } else {
      child.stdin.end();
    }

    // Log errors
    child.stderr.on("data", (data) => {
      console.error(`Git error (${path}):`, data.toString());
    });

    // Handle process exit
    child.on("close", async (code) => {
      if (code === 0) {
        // Trigger Analysis on successful push
        if (!isUpload) { // git-receive-pack
          try {
            // SYNC BACK TO R2
            await releaseRepo(ownerName, repoName, true);
            console.log(`Synced ${ownerName}/${repoName} back to R2 after push`);

            // Trigger Analysis
            const { analyzeRepository } = await import("@/lib/analysis");
            await analyzeRepository(repoData.id, userId).catch(console.error);
          } catch (err) {
            console.error("Failed to sync/analyze after push:", err);
          }
        }
      }
    });

    return new Response(child.stdout as any, {
      headers: {
        "Content-Type": `application/x-${path}-result`,
        "Cache-Control": "no-cache",
      },
    });
  }

  return new Response("Not Found", { status: 404 });
};
