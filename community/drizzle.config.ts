import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL || "file:./data/community.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
