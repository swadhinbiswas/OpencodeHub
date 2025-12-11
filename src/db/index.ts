/**
 * Database initialization and connection
 */

import Database from "better-sqlite3";
import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import * as schema from "./schema";

let db: BetterSQLite3Database<typeof schema> | null = null;

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (db) return db;

  const dbPath = process.env.DATABASE_URL || "./data/opencodehub.db";

  // Ensure directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  db = drizzle(sqlite, { schema });

  return db;
}

export { schema };
export type Database = BetterSQLite3Database<typeof schema>;
