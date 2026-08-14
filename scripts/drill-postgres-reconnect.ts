/**
 * PostgreSQL Reconnect Drill (weekly / manual)
 *
 * Verifies the database layer survives an outage + reconnect cycle:
 *   1. Confirm the DB is connected
 *   2. Close the pool (simulating an outage)
 *   3. Reconnect via getDatabase()
 *   4. Run a real query and confirm results
 *
 * Env:
 *   DATABASE_URL — the PostgreSQL connection string to exercise
 *
 * Exit code 0 on success, 1 on any drill failure.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const reportDir = join(rootDir, "test-results", "drills");
mkdirSync(reportDir, { recursive: true });

const started = Date.now();
const results: Record<string, string> = {};

function ok(name: string, detail = "") {
  results[name] = `PASS${detail ? `: ${detail}` : ""}`;
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail: string) {
  results[name] = `FAIL: ${detail}`;
  console.error(`❌ ${name} — ${detail}`);
}

async function main() {
  // ── Step 1: initial connection ────────────────────────────────────
  try {
    const { getDatabase, isDatabaseConnected } = await import("../src/db/index");
    const db = getDatabase();
    const connected = isDatabaseConnected();
    if (!connected) throw new Error("database reports disconnected at start");
    ok("initial-connection", "pool connected");
  } catch (e) {
    fail("initial-connection", e instanceof Error ? e.message : String(e));
  }

  // ── Step 2: simulate outage (close pool) ──────────────────────────
  try {
    const { closeDatabase } = await import("../src/db/index");
    await closeDatabase();
    ok("outage-simulation", "pool closed cleanly");
  } catch (e) {
    fail("outage-simulation", e instanceof Error ? e.message : String(e));
  }

  // ── Step 3: reconnect ─────────────────────────────────────────────
  try {
    const { getDatabase, isDatabaseConnected } = await import("../src/db/index");
    const db = getDatabase();
    if (!db) throw new Error("getDatabase() returned null after reconnect");
    ok("reconnect", "pool re-created");
  } catch (e) {
    fail("reconnect", e instanceof Error ? e.message : String(e));
  }

  // ── Step 4: real query round-trip ─────────────────────────────────
  try {
    const { getDatabase, schema } = await import("../src/db/index");
    const db = getDatabase();
    const row = await db.query.users.findFirst();
    // A successful query (row may be null on an empty DB) proves the
    // connection + schema registration both work post-reconnect.
    ok("query-roundtrip", row ? `users table readable` : "users table empty but queryable");
  } catch (e) {
    fail("query-roundtrip", e instanceof Error ? e.message : String(e));
  }

  const passed = Object.values(results).every((r) => r.startsWith("PASS"));
  writeFileSync(
    join(reportDir, "postgres-reconnect-report.json"),
    JSON.stringify({ drill: "postgres-reconnect", timestamp: new Date().toISOString(), durationMs: Date.now() - started, results, passed }, null, 2),
  );
  console.log("\n" + JSON.stringify(results, null, 2));
  console.log(passed ? "\n✅ PostgreSQL reconnect drill PASSED" : "\n❌ PostgreSQL reconnect drill FAILED");
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error("Drill crashed:", e);
  process.exit(1);
});
