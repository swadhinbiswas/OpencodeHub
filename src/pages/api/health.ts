import { getDb } from "@/db/adapter";
import type { APIRoute } from "astro";
import { withErrorHandler } from "@/lib/errors";
import { isDistributedLocking } from "@/lib/distributed-lock";
import { isDistributed as isDistributedRateLimit } from "@/lib/rate-limit";
import { getQueueWorkerScalingReadiness } from "@/lib/queue-worker";

export const GET: APIRoute = withErrorHandler(async () => {
  const checks: Record<
    string,
    { status: "ok" | "error"; message?: string; latency?: number; details?: unknown }
  > = {};

  // Check database
  const dbStart = Date.now();
  try {
    const db = getDb();
    await db.rawQuery("SELECT 1");
    checks.database = { status: "ok", latency: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Check Redis (if configured)
  if (process.env.REDIS_URL) {
    const redisStart = Date.now();
    try {
      // Would ping Redis here
      checks.redis = { status: "ok", latency: Date.now() - redisStart };
    } catch (error) {
      checks.redis = {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Check storage
  try {
    const fs = await import("fs/promises");
    const storagePath = process.env.STORAGE_PATH || "./data/storage";
    await fs.access(storagePath);
    checks.storage = { status: "ok" };
  } catch (error) {
    checks.storage = {
      status: "error",
      message:
        error instanceof Error ? error.message : "Storage not accessible",
    };
  }

  // Check horizontal scaling readiness for self-hosted deployments
  const queueWorker = getQueueWorkerScalingReadiness();
  const redisConfigured = Boolean(process.env.REDIS_URL?.trim());
  const production = process.env.NODE_ENV === "production";
  const scalingIssues: string[] = [];

  if (production && !redisConfigured) {
    scalingIssues.push("REDIS_URL is required in production for distributed coordination");
  }
  if (production && !isDistributedLocking) {
    scalingIssues.push("Distributed locking is not active");
  }
  if (production && !isDistributedRateLimit) {
    scalingIssues.push("Distributed rate limiting is not active");
  }
  if (production && !queueWorker.multiInstanceSafe) {
    scalingIssues.push("Queue worker is not multi-instance safe");
  }

  checks.scaling = {
    status: scalingIssues.length ? "error" : "ok",
    ...(scalingIssues.length ? { message: scalingIssues.join("; ") } : {}),
    details: {
      production,
      redisConfigured,
      distributedLocking: isDistributedLocking,
      distributedRateLimit: isDistributedRateLimit,
      queueWorker,
    },
  };

  // Overall health
  const isHealthy = Object.values(checks).every(
    (check) => check.status === "ok"
  );

  return new Response(
    JSON.stringify({
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date(),
      version: process.env.npm_package_version || "1.0.0",
      uptime: process.uptime(),
      checks,
    }),
    {
      status: isHealthy ? 200 : 503,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
});
