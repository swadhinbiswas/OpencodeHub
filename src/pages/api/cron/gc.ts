import { getDatabase } from "@/db";
import type { APIRoute } from "astro";
import { spawn } from "child_process";
import { promisify } from "util";

const exec = promisify(require("child_process").exec);

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET || "default-secret"; // Should be set in env

  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDatabase();
  const repos = await db.query.repositories.findMany();

  console.log(
    `[GC] Starting garbage collection for ${repos.length} repositories...`
  );

  let successCount = 0;
  let errorCount = 0;

  for (const repo of repos) {
    try {
      console.log(`[GC] Processing ${repo.ownerId}/${repo.name}...`);
      // Run git gc --auto --quiet
      const child = spawn("git", ["gc", "--auto", "--quiet"], {
        cwd: repo.diskPath,
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
      console.error(`[GC] Error processing ${repo.name}:`, e);
      errorCount++;
    }
  }

  console.log(
    `[GC] Completed. Success: ${successCount}, Errors: ${errorCount}`
  );

  return new Response(
    JSON.stringify({ success: successCount, errors: errorCount }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
};
