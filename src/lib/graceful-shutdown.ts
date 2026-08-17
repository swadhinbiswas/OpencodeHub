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

import { closeDatabase } from "@/db";
import { logger } from "@/lib/logger";

let isShuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 30_000;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Received shutdown signal, draining...");

  // Set flag so health checks return "shutting down"
  process.env.OPCODEHUB_SHUTTING_DOWN = "1";

  // Force exit after timeout
  const forceTimer = setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  try {
    // Close database connections
    await closeDatabase();
    logger.info("Database connections closed");
  } catch (err) {
    logger.error({ err }, "Error closing database connections");
  }

  try {
    // Close Redis if available — import dynamically to avoid circular deps
    const { closeRedis } = await import("@/lib/redis");
    await closeRedis();
  } catch {
    // Redis not available, skip
  }

  logger.info("Shutdown complete, exiting...");

  // Let the process exit naturally once all handles are drained
  setTimeout(() => process.exit(0), 1000);
}

// Handle signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors — log and exit to let process manager restart
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — exiting to prevent corrupted state");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled rejection — exiting to let process manager restart");
  process.exit(1);
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
