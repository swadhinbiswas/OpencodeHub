/**
 * Backup & Restore Drill (weekly / manual)
 *
 * Verifies the full backup → verify → restore loop end-to-end:
 *   1. Run scripts/backup.ts against the live database
 *   2. Verify the archive checksum (scripts/backup-verify.ts)
 *   3. Restore into a scratch database (never the live DB)
 *   4. Compare table counts between live and restored DBs
 *   5. Write a machine-readable report to test-results/drills/
 *
 * Env:
 *   DATABASE_URL          — live database URL
 *   BACKUP_DESTINATION    — where backup artifacts land (default: file:./test-results/drills)
 *   RESTORE_SCRATCH_DB    — scratch database name to restore into (default: och_restore_drill)
 *
 * Exit code 0 on success, 1 on any drill failure.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const reportDir =
  process.env.BACKUP_DESTINATION?.replace("file:", "") ||
  join(rootDir, "test-results", "drills");
const dbUrl =
  process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
const scratchDb = process.env.RESTORE_SCRATCH_DB || "och_restore_drill";
const scratchUrl = dbUrl.replace(/\/[^/]+$/, `/${scratchDb}`);
const backupDir = join(reportDir, "backup");

mkdirSync(reportDir, { recursive: true });
mkdirSync(backupDir, { recursive: true });

const started = Date.now();
const results: Record<string, string> = {};

function ok(name: string, detail = "") {
  results[name] = `PASS${detail ? `: ${detail}` : ""}`;
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, err: unknown) {
  results[name] = `FAIL: ${err instanceof Error ? err.message : String(err)}`;
  console.error(`❌ ${name} — ${err instanceof Error ? err.message : String(err)}`);
}

function run(cmd: string, env: Record<string, string> = {}, allowFail = false): string {
  try {
    return execSync(cmd, {
      cwd: rootDir,
      env: { ...process.env, ...env } as Record<string, string>,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    if (allowFail) return "";
    throw e;
  }
}

async function main() {
  try {
    // ── Step 1: backup ──────────────────────────────────────────────
    try {
      run("bun scripts/backup.ts", {
        BACKUP_DIR: backupDir,
        BACKUP_RETENTION_DAYS: "1",
      });
      ok("backup", "full backup produced");
    } catch (e) {
      fail("backup", e);
      throw e;
    }

    // ── Step 2: verify archive ──────────────────────────────────────
    let archivePath: string | null = null;
    try {
      const archives = readdirSync(backupDir).filter((f) => f.endsWith(".tar.gz"));
      if (archives.length === 0) throw new Error("no .tar.gz archive produced");
      archivePath = join(backupDir, archives.sort().at(-1)!);
      run(`bun scripts/backup-verify.ts ${archivePath}`);
      ok("backup-verify", `checksum verified for ${archives.at(-1)}`);
    } catch (e) {
      fail("backup-verify", e);
      throw e;
    }

    // ── Step 3: restore into scratch DB ─────────────────────────────
    try {
      run(`psql "${dbUrl}" -c "DROP DATABASE IF EXISTS ${scratchDb};"`, {}, true);
      run(`psql "${dbUrl}" -c "CREATE DATABASE ${scratchDb};"`);
    } catch (e) {
      fail("scratch-db", e);
      throw e;
    }

    try {
      run(`bun scripts/restore.ts ${archivePath}`, {
        DATABASE_URL: scratchUrl,
        RESTORE_REPOS: "false",
        RESTORE_ENV: "false",
      });
      ok("restore", "restore completed");
    } catch (e) {
      fail("restore", e);
      throw e;
    }

    // ── Step 4: compare schema consistency ──────────────────────────
    try {
      const live = run(
        `psql "${dbUrl}" -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"`,
      ).trim();
      const restored = run(
        `psql "${scratchUrl}" -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"`,
      ).trim();
      if (live !== restored) {
        throw new Error(`table count mismatch: live=${live} restored=${restored}`);
      }
      ok("restore-consistency", `public tables match (${restored})`);
    } catch (e) {
      fail("restore-consistency", e);
      throw e;
    }

    // ── Step 5: cleanup scratch DB ──────────────────────────────────
    run(`psql "${dbUrl}" -c "DROP DATABASE IF EXISTS ${scratchDb};"`, {}, true);
  } catch {
    /* failures recorded per-step */
  }

  const passed = Object.values(results).every((r) => r.startsWith("PASS"));
  const report = {
    drill: "backup-restore",
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - started,
    results,
    passed,
  };
  writeFileSync(
    join(reportDir, "backup-restore-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("\nReport:", join(reportDir, "backup-restore-report.json"));
  console.log(JSON.stringify(results, null, 2));
  console.log(passed ? "\n✅ Backup & Restore drill PASSED" : "\n❌ Backup & Restore drill FAILED");
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error("Drill crashed:", e);
  process.exit(1);
});
