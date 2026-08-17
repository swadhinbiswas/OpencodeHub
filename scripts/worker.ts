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
const MIRROR_SYNC_INTERVAL = parseInt(process.env.MIRROR_SYNC_INTERVAL || "60000", 10);
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL || "3600000", 10);
const DIGEST_INTERVAL = parseInt(process.env.DIGEST_INTERVAL || "300000", 10);
const SCHEDULE_INTERVAL = parseInt(process.env.SCHEDULE_INTERVAL || "60000", 10);
const HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT || "9090", 10);
const MAX_RETRIES = parseInt(process.env.WORKER_MAX_RETRIES || "3", 10);
const STALE_JOB_TIMEOUT_MS = parseInt(process.env.WORKER_STALE_TIMEOUT || "300000", 10);

// Circuit breaker settings
const CIRCUIT_BREAKER_THRESHOLD = parseInt(process.env.WORKER_CB_THRESHOLD || "10", 10);
const CIRCUIT_BREAKER_RESET_MS = parseInt(process.env.WORKER_CB_RESET_MS || "60000", 10);

// ── State ─────────────────────────────────────────────────────────────────────
let isShuttingDown = false;
let lastQueueRun = 0;
let lastMirrorRun = 0;
let lastCleanupRun = 0;
let lastDigestRun = 0;
let lastScheduleRun = 0;

// Circuit breaker state per task
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
  openedAt: number;
}
const circuitBreakers = new Map<string, CircuitBreakerState>();

function getCircuitBreaker(name: string): CircuitBreakerState {
  let cb = circuitBreakers.get(name);
  if (!cb) {
    cb = { failures: 0, lastFailureTime: 0, isOpen: false, openedAt: 0 };
    circuitBreakers.set(name, cb);
  }
  return cb;
}

function isCircuitOpen(name: string): boolean {
  const cb = getCircuitBreaker(name);
  if (!cb.isOpen) return false;
  if (Date.now() - cb.openedAt > CIRCUIT_BREAKER_RESET_MS) {
    cb.isOpen = false;
    cb.failures = 0;
    logger.info({ task: name }, "Circuit breaker reset (half-open)");
    return false;
  }
  return true;
}

function recordSuccess(name: string): void {
  const cb = getCircuitBreaker(name);
  cb.failures = 0;
  cb.isOpen = false;
}

function recordFailure(name: string): void {
  const cb = getCircuitBreaker(name);
  cb.failures++;
  cb.lastFailureTime = Date.now();
  if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    cb.isOpen = true;
    cb.openedAt = Date.now();
    logger.error({ task: name, failures: cb.failures }, "Circuit breaker OPENED");
  }
}

// ── Exponential Backoff ────────────────────────────────────────────────────────
async function backoff(attempt: number): Promise<void> {
  const delay = Math.min(1000 * Math.pow(2, attempt), 60000);
  await sleep(delay + Math.random() * 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Queue Processor ───────────────────────────────────────────────────────────
async function runQueueProcessor() {
  if (isCircuitOpen("queue-processor")) {
    logger.warn("Queue processor circuit open — skipping");
    return;
  }

  const db = getDatabase();

  try {
    // 1. Reclaim stale jobs (stuck in "running" too long)
    try {
      const staleThreshold = new Date(Date.now() - STALE_JOB_TIMEOUT_MS);
      const staleItems = await db.query.mergeQueueItems.findMany({
        where: eq(schema.mergeQueueItems.status, "running"),
        columns: { id: true, startedAt: true, attemptCount: true },
      });
      for (const item of staleItems) {
        if (item.startedAt && new Date(item.startedAt) < staleThreshold) {
          const attempts = (item.attemptCount || 0) + 1;
          if (attempts > MAX_RETRIES) {
            await (db as NodePgDatabase<typeof schema>)
              .update(schema.mergeQueueItems)
              .set({ status: "failed", completedAt: new Date() })
              .where(eq(schema.mergeQueueItems.id, item.id));
            logger.warn({ itemId: item.id, attempts }, "Queue item exceeded max retries — moved to dead letter");
          } else {
            await (db as NodePgDatabase<typeof schema>)
              .update(schema.mergeQueueItems)
              .set({ status: "queued" })
              .where(eq(schema.mergeQueueItems.id, item.id));
            logger.warn({ itemId: item.id, attempts }, "Reclaimed stale queue item with backoff");
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "Stale job reclaim failed (non-fatal)");
    }

    // 2. Process pending items
    const pendingItems = await db.query.mergeQueueItems.findMany({
      where: eq(schema.mergeQueueItems.status, "queued"),
      columns: { repositoryId: true },
    });

    const repoIds = [...new Set(pendingItems.map((item) => item.repositoryId))];

    if (repoIds.length > 0) {
      logger.info({ repoCount: repoIds.length }, "Processing merge queues");
      for (const repoId of repoIds) {
        if (isShuttingDown) break;
        try {
          await queueWorker.processQueue(repoId);
        } catch (error) {
          logger.error({ err: error, repoId }, "Failed to process queue for repo");
          recordFailure("queue-processor");
        }
      }
    }

    recordSuccess("queue-processor");
    lastQueueRun = Date.now();
  } catch (error) {
    recordFailure("queue-processor");
    logger.error({ err: error }, "Fatal error in queue processor loop");
  }
}

// ── Controlled Loop with Exponential Backoff ───────────────────────────────────
async function runLoop(
  name: string,
  fn: () => Promise<void>,
  intervalMs: number,
  getLastRun: () => number,
  setLastRun: (t: number) => void,
) {
  let attempt = 0;
  while (!isShuttingDown) {
    const elapsed = Date.now() - getLastRun();
    if (elapsed >= intervalMs) {
      if (isCircuitOpen(name)) {
        logger.warn({ task: name }, `Circuit open — skipping ${name}`);
        await sleep(Math.min(intervalMs, 5000));
        continue;
      }
      try {
        await fn();
        attempt = 0;
      } catch (error) {
        attempt++;
        logger.error({ err: error, task: name, attempt }, `${name} failed`);
        recordFailure(name);
        if (attempt < MAX_RETRIES) {
          await backoff(attempt);
        }
      }
      setLastRun(Date.now());
    }
    await sleep(Math.min(intervalMs, 1000));
  }
}

// ── Health Check Server ───────────────────────────────────────────────────────
function startHealthServer() {
  const server = createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/health") {
      const timeSinceLastRun = Date.now() - lastQueueRun;
      const healthy = !isShuttingDown && timeSinceLastRun < WORKER_INTERVAL * 10;
      res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: healthy ? "healthy" : "unhealthy",
        uptime: process.uptime(),
        lastQueueRun: new Date(lastQueueRun).toISOString(),
        circuitBreakers: Object.fromEntries(
          Array.from(circuitBreakers.entries()).map(([k, v]) => [
            k,
            { isOpen: v.isOpen, failures: v.failures },
          ]),
        ),
        shuttingDown: isShuttingDown,
      }));
    } else if (req.url === "/ready") {
      const ready = !isShuttingDown;
      res.writeHead(ready ? 200 : 503);
      res.end(ready ? "ready" : "not ready");
    } else if (req.url === "/metrics") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      const lines: string[] = [];
      lines.push("# HELP worker_circuit_breaker_state Circuit breaker open/closed per task");
      lines.push("# TYPE worker_circuit_breaker_state gauge");
      for (const [name, cb] of circuitBreakers) {
        lines.push(`worker_circuit_breaker_state{task="${name}"} ${cb.isOpen ? 1 : 0}`);
        lines.push(`worker_circuit_breaker_failures{task="${name}"} ${cb.failures}`);
      }
      res.end(lines.join("\n") + "\n");
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
    await sleep(10_000);
    logger.info("Worker shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception in worker");
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled rejection in worker");
    process.exit(1);
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
      circuitBreakerThreshold: CIRCUIT_BREAKER_THRESHOLD,
      circuitBreakerResetMs: CIRCUIT_BREAKER_RESET_MS,
    },
    "Starting OpenCodeHub Background Worker...",
  );

  const healthServer = startHealthServer();
  setupGracefulShutdown(healthServer);

  await runQueueProcessor();

  await Promise.all([
    runLoop("queue-processor", runQueueProcessor, WORKER_INTERVAL, () => lastQueueRun, (t) => { lastQueueRun = t; }),
    runLoop("mirror-sync", async () => { await syncAllMirrors(); }, MIRROR_SYNC_INTERVAL, () => lastMirrorRun, (t) => { lastMirrorRun = t; }),
    runLoop("cleanup", () => cleanupAllRepos(), CLEANUP_INTERVAL, () => lastCleanupRun, (t) => { lastCleanupRun = t; }),
    runLoop("digest", async () => {
      logger.info("Running scheduled digests processing...");
      await runDueDigests();
    }, DIGEST_INTERVAL, () => lastDigestRun, (t) => { lastDigestRun = t; }),
    runLoop("schedule", async () => {
      const { runScheduledWorkflows } = await import("@/lib/schedule-worker");
      const { pipelineRunner } = await import("@/lib/pipeline");
      await runScheduledWorkflows(pipelineRunner);
    }, SCHEDULE_INTERVAL, () => lastScheduleRun, (t) => { lastScheduleRun = t; }),
  ]);
}

startWorker().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});
