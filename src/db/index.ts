/**
 * Database initialization and connection
 * Supports SQLite (default), with PostgreSQL and MySQL coming soon
 */

import Database from "better-sqlite3";
import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleLibSQL, LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { logger } from "@/lib/logger";
import * as schema from "./schema";

// Database driver types
export type DatabaseDriver = "sqlite" | "postgres" | "mysql" | "libsql" | "turso";

let db: BetterSQLite3Database<typeof schema> | LibSQLDatabase<typeof schema> | null =
  null;

/**
 * Get database configuration from environment
 */
function getDbConfig(): { driver: DatabaseDriver; url: string } {
  const driver = (process.env.DATABASE_DRIVER || "sqlite") as DatabaseDriver;
  const url = process.env.DATABASE_URL || "./data/opencodehub.db";
  return { driver, url };
}

/**
 * Get or create database connection
 */
export function getDatabase():
  | BetterSQLite3Database<typeof schema>
  | LibSQLDatabase<typeof schema> {
  if (db) return db;

  const { driver, url } = getDbConfig();

  // Support for Turso/LibSQL
  if (driver === "libsql" || driver === "turso") {
    const client = createClient({
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
    db = drizzleLibSQL(client, { schema });
    logger.info({ driver: "libsql", url }, "Database connected (LibSQL)");
    return db;
  }

  // Currently only SQLite is fully supported
  // PostgreSQL and MySQL schemas need separate implementations
  if (driver !== "sqlite") {
    logger.warn(
      { driver, url },
      "Non-SQLite drivers require manual schema setup. Falling back to SQLite."
    );
  }

  const dbPath = driver === "sqlite" ? url : "./data/opencodehub.db";

  // Ensure directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
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
export function closeDatabase(): void {
  if (db) {
    logger.info("Database connection closed");
    db = null;
  }
}

// Export schema and types
export { schema };
export type Database =
  | BetterSQLite3Database<typeof schema>
  | LibSQLDatabase<typeof schema>;
