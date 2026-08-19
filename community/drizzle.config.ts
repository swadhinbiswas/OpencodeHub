import { defineConfig } from "drizzle-kit";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  throw new Error(
    "TURSO_DATABASE_URL is required for drizzle-kit. Set it in .env or as an env var.\n" +
    "Create a database at https://turso.tech/dashboard and get the URL from there.\n" +
    "Example: libsql://your-db-name-your-org.turso.io"
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  },
});
