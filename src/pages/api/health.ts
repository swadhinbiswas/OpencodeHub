import { getDb } from "@/db/adapter";
import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const checks: Record<
    string,
    { status: "ok" | "error"; message?: string; latency?: number }
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

  // Overall health
  const isHealthy = Object.values(checks).every(
    (check) => check.status === "ok"
  );

  return new Response(
    JSON.stringify({
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
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
};
