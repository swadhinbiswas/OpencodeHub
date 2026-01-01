import { defineConfig } from "drizzle-kit";

// Get driver type from environment
const driver = process.env.DATABASE_DRIVER || "sqlite";
const url = process.env.DATABASE_URL || "./data/opencodehub.db";

// Map driver to Drizzle dialect
const dialectMap: Record<string, "sqlite" | "postgresql" | "mysql" | "turso"> = {
  sqlite: "sqlite",
  postgres: "postgresql",
  mysql: "mysql",
  libsql: "turso",
  turso: "turso",
};

const dialect = dialectMap[driver] || "sqlite";

// Build credentials based on driver
function getCredentials() {
  switch (driver) {
    case "postgres":
    case "mysql":
      return { url };
    case "libsql":
    case "turso":
      return { url, authToken: process.env.DATABASE_AUTH_TOKEN };
    case "sqlite":
    default:
      return { url };
  }
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect,
  dbCredentials: getCredentials(),
  verbose: true,
  strict: true,
});
