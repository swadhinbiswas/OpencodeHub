import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;

  const url = (
    process.env.TURSO_DATABASE_URL ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.TURSO_DATABASE_URL) ||
    ""
  ).trim();

  const authToken = (
    process.env.TURSO_AUTH_TOKEN ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.TURSO_AUTH_TOKEN) ||
    ""
  ).trim();

  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is required. Set it in your .env to a Turso database URL.\n" +
      "Example: TURSO_DATABASE_URL=libsql://your-db-name-your-org.turso.io"
    );
  }

  const client = createClient({
    url,
    authToken: authToken || undefined,
  });

  _db = drizzle(client, { schema });
  return _db;
}

export * from "./schema";

