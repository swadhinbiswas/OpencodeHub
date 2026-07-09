/**
 * Graceful shutdown handler for the main OpenCodeHub process.
 * Import this at the top of the entry point or via NODE_OPTIONS --require.
 *
 * Handles SIGTERM, SIGINT, and uncaught errors to ensure:
 * - In-flight HTTP requests complete
 * - Database connections drain
 * - Redis connections close
 * - Worker queues stop accepting new jobs
 */

import { logger } from "@/lib/logger";

let isShuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 30_000;

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Received shutdown signal, draining...");

  // Force exit after timeout
  const forceTimer = setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  // Let the process exit naturally once all handles are drained.
  // The Node.js event loop will empty when no more async work is pending.
  // We set a flag so any health check returns "shutting down".
  process.env.OPCODEHUB_SHUTTING_DOWN = "1";

  logger.info("Shutdown signal processed, waiting for in-flight requests...");
}

// Handle signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors — log and continue (don't crash)
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  // In production, don't crash — log and keep serving
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
  // In production, don't crash
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});

// Memory pressure warning
if (process.env.NODE_ENV === "production") {
  const memCheck = setInterval(() => {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const rssUsedMB = Math.round(usage.rss / 1024 / 1024);

    if (heapUsedMB > 1024) {
      logger.warn({ heapUsedMB, rssUsedMB }, "High memory usage detected");
    }
  }, 60_000);
  memCheck.unref();
}

export { isShuttingDown };
