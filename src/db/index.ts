import Database from "better-sqlite3";
import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleLibSQL, LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle as drizzlePg, NodePgDatabase } from "drizzle-orm/node-postgres";
import { createClient } from "@libsql/client";
import pg from "pg";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { logger } from "@/lib/logger";
import * as schema from "./schema";

// Force SSL bypass for self-signed certs (Aiven)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Database driver types
export type DatabaseDriver = "sqlite" | "postgres" | "mysql" | "libsql" | "turso";

let db: BetterSQLite3Database<typeof schema> | LibSQLDatabase<typeof schema> | NodePgDatabase<typeof schema> | null =
  null;

/**
 * Get database configuration from environment
 */
function getDbConfig(): { driver: DatabaseDriver; url: string } {
  // Use import.meta.env for Astro/Vite, fallback to process.env for scripts
  const envDriver = import.meta.env?.DATABASE_DRIVER || process.env.DATABASE_DRIVER;
  const envUrl = import.meta.env?.DATABASE_URL || process.env.DATABASE_URL;

  const driver = (envDriver || "sqlite") as DatabaseDriver;
  const url = envUrl || "./data/opencodehub.db";

  return { driver, url };
}

/**
 * Get or create database connection
 */
export function getDatabase():
  | BetterSQLite3Database<typeof schema>
  | LibSQLDatabase<typeof schema>
  | NodePgDatabase<typeof schema> {
  if (db) return db;

  const { driver, url } = getDbConfig();

  // Support for Turso/LibSQL
  if (driver === "libsql" || driver === "turso") {
    const authToken = import.meta.env?.DATABASE_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;
    const client = createClient({
      url,
      authToken,
    });
    db = drizzleLibSQL(client, { schema });
    logger.info({ driver: "libsql", url }, "Database connected (LibSQL)");
    return db;
  }

  // Support for PostgreSQL
  if (driver === "postgres") {
    // Strip sslmode from URL to avoid conflict with ssl config option
    const cleanUrl = url.replace(/[\?&]sslmode=require/, "");
    const pool = new pg.Pool({
      connectionString: cleanUrl,
      ssl: { rejectUnauthorized: false },
    });
    db = drizzlePg(pool, { schema });
    logger.info({ driver: "postgres" }, "Database connected (PostgreSQL)");
    return db;
  }

  // Currently only SQLite, LibSQL and Postgres are fully supported
  if (driver === "mysql") {
    logger.warn(
      { driver, url },
      "MySQL driver validation pending. Falling back to SQLite."
    );
  }

  const dbPath = (driver === "sqlite" || driver === "mysql") ? url : "./data/opencodehub.db";

  // Ensure directory exists for local SQLite
  if (!url.includes("://")) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  db = drizzle(sqlite, { schema });
  logger.info({ driver: "sqlite", path: dbPath }, "Database connected");

  return db;
}

/**
 * Get current database driver type
 */
export function getDriverType(): DatabaseDriver {
  const { driver } = getDbConfig();
  return driver;
}

/**
 * Check if database is connected
 */
export function isDatabaseConnected(): boolean {
  return db !== null;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    if ('close' in db) {
      // Handle SQLite close
      // @ts-ignore
      db.close();
    }
    // For PG pool, we might need to close the pool if we had access to it, 
    // but Drizzle doesn't expose it directly on the db instance easily without type casting.
    // In serverless/long-running app, closing might not be strictly necessary unless ensuring graceful shutdown.

    logger.info("Database connection closed");
    db = null;
  }
}

// Export schema and types
export { schema };
export type Database =
  | BetterSQLite3Database<typeof schema>
  | LibSQLDatabase<typeof schema>
  | NodePgDatabase<typeof schema>;
