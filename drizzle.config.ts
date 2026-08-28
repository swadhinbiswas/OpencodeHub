import { config } from "dotenv";
config();
import { defineConfig } from "drizzle-kit";

// Get driver type from environment
// Default to PostgreSQL since all schemas use pgTable
const driver = process.env.DATABASE_DRIVER || "postgres";
const url =
  process.env.DATABASE_URL ||
  "postgresql://opencodehub:opencodehub@localhost:5432/opencodehub";

// Map driver to Drizzle dialect
const dialectMap: Record<string, "sqlite" | "postgresql" | "mysql" | "turso"> =
  {
    sqlite: "sqlite",
    postgres: "postgresql",
    mysql: "mysql",
    libsql: "turso",
    turso: "turso",
  };

const dialect = dialectMap[driver] || "postgresql";

// Build credentials based on driver
function getCredentials() {
  switch (driver) {
    case "postgres":
    case "mysql": {
      const isLocal = url.includes("localhost") || url.includes("127.0.0.1") || url.includes("@postgres:");
      return { url, ssl: isLocal ? false : { rejectUnauthorized: false } };
    }
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
