/**
 * Apply committed Drizzle migrations to the database.
 *
 * Used by the Docker entrypoint and production deployment to apply schema
 * migrations deterministically. Requires only `drizzle-orm` (a runtime
 * dependency) — not `drizzle-kit` — so it works in slim production images.
 *
 * Usage:  bun scripts/migrate.ts
 * Env:    DATABASE_URL, DATABASE_DRIVER, DATABASE_SSL, DATABASE_SSL_REJECT_UNAUTHORIZED
 */

import { createClient } from "@libsql/client";
import { config } from "dotenv";
import Database from "better-sqlite3";
import pg from "pg";

config();

async function run() {
  const driver = process.env.DATABASE_DRIVER || "postgres";

  if (driver === "postgres") {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");

    const url =
      process.env.DATABASE_URL ||
      "postgresql://opencodehub:opencodehub@localhost:5432/opencodehub";
    const ssl =
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
        : undefined;

    const client = new pg.Client({ connectionString: url, ssl });
    await client.connect();
    try {
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: "./drizzle" });
    } finally {
      await client.end();
    }
  } else if (driver === "sqlite") {
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");

    const url = process.env.DATABASE_URL || "./data/opencodehub.db";
    const client = new Database(url);
    try {
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: "./drizzle" });
    } finally {
      client.close();
    }
  } else {
    // libsql / turso
    const { drizzle } = await import("drizzle-orm/libsql");
    const { migrate } = await import("drizzle-orm/libsql/migrator");

    const url = process.env.DATABASE_URL || "libsql://localhost:8000";
    const client = createClient({ url });
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
  }

  console.log("✅ Database migrations applied");
}

run().catch((err) => {
  console.error("❌ Database migration failed:", err);
  process.exit(1);
});
