import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { cleanupAllRepos } from "@/lib/cron/cleanup-branches";
import { logger } from "@/lib/logger";
import { syncAllMirrors } from "@/lib/mirror-sync";
import { queueWorker } from "@/lib/queue-worker";
import { runDueDigests } from "@/lib/chat-notifications";
import { eq } from "drizzle-orm";
import { createServer } from "http";

// ── Configuration ─────────────────────────────────────────────────────────────
const WORKER_INTERVAL = parseInt(process.env.WORKER_INTERVAL || "5000", 10);
const MIRROR_SYNC_INTERVAL = parseInt(
  process.env.MIRROR_SYNC_INTERVAL || "60000",
  10,
);
const CLEANUP_INTERVAL = parseInt(
  process.env.CLEANUP_INTERVAL || "3600000",
  10,
);
const DIGEST_INTERVAL = parseInt(
  process.env.DIGEST_INTERVAL || "300000", // Every 5 minutes
  10,
);
const HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT || "9090", 10);
const MAX_RETRIES = parseInt(process.env.WORKER_MAX_RETRIES || "3", 10);
const STALE_JOB_TIMEOUT_MS = parseInt(
  process.env.WORKER_STALE_TIMEOUT || "300000",
  10,
);

// ── State ─────────────────────────────────────────────────────────────────────
let isShuttingDown = false;
let isHealthy = true;
let lastQueueRun = Date.now();
let lastMirrorRun = 0;
let lastCleanupRun = 0;
let lastDigestRun = 0;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 10;

// ── Queue Processor ───────────────────────────────────────────────────────────
async function runQueueProcessor() {
  const db = getDatabase();

  try {
    // 1. Reclaim stale jobs (stuck in "running" too long)
    try {
      const staleThreshold = new Date(Date.now() - STALE_JOB_TIMEOUT_MS);
      const staleItems = await db.query.mergeQueueItems.findMany({
        where: eq(schema.mergeQueueItems.status, "running"),
        columns: { id: true, startedAt: true },
      });
      for (const item of staleItems) {
        if (item.startedAt && new Date(item.startedAt) < staleThreshold) {
          await (db as NodePgDatabase<typeof schema>)
            .update(schema.mergeQueueItems)
            .set({ status: "queued" })
            .where(eq(schema.mergeQueueItems.id, item.id));
          logger.warn({ itemId: item.id }, "Reclaimed stale queue item");
        }
      }
    } catch {
      // startedAt column may not exist yet — skip stale reclaim
    }

    // 2. Process pending items
    const pendingItems = await db.query.mergeQueueItems.findMany({
      where: eq(schema.mergeQueueItems.status, "queued"),
      columns: { repositoryId: true },
    });

    const repoIds = [...new Set(pendingItems.map((item) => item.repositoryId))];

    if (repoIds.length > 0) {
      logger.info({ repoCount: repoIds.length }, "Processing merge queues");
      // Process sequentially to avoid race conditions
      for (const repoId of repoIds) {
        if (isShuttingDown) break;
        try {
          await queueWorker.processQueue(repoId);
        } catch (error) {
          logger.error(
            { err: error, repoId },
            "Failed to process queue for repo",
          );
        }
      }
    }

    consecutiveErrors = 0;
    lastQueueRun = Date.now();
  } catch (error) {
    consecutiveErrors++;
    logger.error(
      { err: error, consecutiveErrors },
      "Error in queue processor loop",
    );
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      isHealthy = false;
      logger.error("Too many consecutive errors. Worker marked unhealthy.");
    }
  }
}

// ── Controlled Loop (replaces setInterval) ────────────────────────────────────
async function runLoop(
  name: string,
  fn: () => Promise<void>,
  intervalMs: number,
  getLastRun: () => number,
  setLastRun: (t: number) => void,
) {
  while (!isShuttingDown) {
    const elapsed = Date.now() - getLastRun();
    if (elapsed >= intervalMs) {
      try {
        await fn();
      } catch (error) {
        logger.error({ err: error, task: name }, `${name} failed`);
      }
      setLastRun(Date.now());
    }
    await sleep(Math.min(intervalMs, 1000));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Health Check Server ───────────────────────────────────────────────────────
function startHealthServer() {
  const server = createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/health") {
      const timeSinceLastRun = Date.now() - lastQueueRun;
      const healthy = isHealthy && timeSinceLastRun < WORKER_INTERVAL * 5;
      res.writeHead(healthy ? 200 : 503, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify({
          status: healthy ? "healthy" : "unhealthy",
          uptime: process.uptime(),
          lastQueueRun: new Date(lastQueueRun).toISOString(),
          consecutiveErrors,
          shuttingDown: isShuttingDown,
        }),
      );
    } else if (req.url === "/ready") {
      res.writeHead(isHealthy ? 200 : 503);
      res.end(isHealthy ? "ready" : "not ready");
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  server.listen(HEALTH_PORT, () => {
    logger.info({ port: HEALTH_PORT }, "Worker health server started");
  });
  return server;
}

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
function setupGracefulShutdown(healthServer: ReturnType<typeof createServer>) {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, "Worker shutting down gracefully...");
    healthServer.close();

    // Give in-flight jobs up to 10s to complete
    await sleep(10_000);
    logger.info("Worker shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception in worker");
    isHealthy = false;
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled rejection in worker");
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function startWorker() {
  logger.info(
    {
      queueInterval: WORKER_INTERVAL,
      mirrorInterval: MIRROR_SYNC_INTERVAL,
      cleanupInterval: CLEANUP_INTERVAL,
      healthPort: HEALTH_PORT,
      maxRetries: MAX_RETRIES,
    },
    "Starting OpenCodeHub Background Worker...",
  );

  const healthServer = startHealthServer();
  setupGracefulShutdown(healthServer);

  // Run initial processing immediately
  await runQueueProcessor();

  // Start concurrent task loops
  await Promise.all([
    runLoop(
      "queue-processor",
      runQueueProcessor,
      WORKER_INTERVAL,
      () => lastQueueRun,
      (t) => {
        lastQueueRun = t;
      },
    ),
    runLoop(
      "mirror-sync",
      async () => { await syncAllMirrors(); },
      MIRROR_SYNC_INTERVAL,
      () => lastMirrorRun,
      (t) => {
        lastMirrorRun = t;
      },
    ),
    runLoop(
      "cleanup",
      () => cleanupAllRepos(),
      CLEANUP_INTERVAL,
      () => lastCleanupRun,
      (t) => {
        lastCleanupRun = t;
      },
    ),
    runLoop(
      "digest",
      async () => {
        logger.info("Running scheduled digests processing...");
        await runDueDigests();
      },
      DIGEST_INTERVAL,
      () => lastDigestRun,
      (t) => {
        lastDigestRun = t;
      },
    ),
  ]);
}

startWorker().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});
