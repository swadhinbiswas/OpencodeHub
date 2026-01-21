import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "@/lib/logger";
import { resolveRepoPath } from "@/lib/git-storage";
import type { APIRoute } from "astro";
import { spawn } from "child_process";
// removed

// const exec = default... removed

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET || "default-secret"; // Should be set in env

  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repos = await db.query.repositories.findMany();

  logger.info({ count: repos.length }, "Starting garbage collection");

  let successCount = 0;
  let errorCount = 0;

  for (const repo of repos) {
    try {
      logger.debug({ owner: repo.ownerId, name: repo.name }, "Processing repository");
      // Run git gc --auto --quiet
      const repoPath = await resolveRepoPath(repo.diskPath);
      const child = spawn("git", ["gc", "--auto", "--quiet"], {
        cwd: repoPath,
        stdio: "ignore",
      });

      await new Promise<void>((resolve, reject) => {
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Exit code ${code}`));
        });
        child.on("error", reject);
      });

      successCount++;
    } catch (e) {
      logger.error({ err: e, repo: repo.name }, "GC error");
      errorCount++;
    }
  }

  logger.info({ success: successCount, errors: errorCount }, "GC completed");

  return new Response(
    JSON.stringify({ success: successCount, errors: errorCount }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
};
