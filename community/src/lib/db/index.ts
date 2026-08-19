import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;

  const url = process.env.TURSO_DATABASE_URL || "file:./data/community.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // Ensure the directory exists for file: URLs
  if (url.startsWith("file:")) {
    const filePath = url.replace("file:", "");
    const abs = resolve(filePath);
    try { mkdirSync(dirname(abs), { recursive: true }); } catch {}
  }

  const client = createClient({ url, authToken });
  _db = drizzle(client, { schema });
  return _db;
}

export * from "./schema";
