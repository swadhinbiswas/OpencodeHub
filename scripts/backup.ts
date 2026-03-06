/**
 * OpenCodeHub Backup Script
 *
 * Features:
 * - Full + incremental backup modes (--incremental flag)
 * - Database backup (SQLite .backup, PostgreSQL pg_dump)
 * - Repository archiving with compression
 * - Optional AES-256 encryption (BACKUP_ENCRYPTION_KEY)
 * - Optional S3 upload (BACKUP_S3_BUCKET)
 * - Retention policy (BACKUP_RETENTION_DAYS, default 30)
 * - SHA-256 checksums in manifest for verification
 *
 * Usage:
 *   npx tsx scripts/backup.ts              # Full backup
 *   npx tsx scripts/backup.ts --incremental # Incremental backup
 */

import { execSync } from "child_process";
import { createCipheriv, createHash, randomBytes } from "crypto";
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";

// ── Setup ─────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const backupDir = process.env.BACKUP_DIR || join(rootDir, "backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const targetDir = join(backupDir, `backup-${timestamp}`);

const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || "";
const S3_BUCKET = process.env.BACKUP_S3_BUCKET || "";
const S3_PREFIX = process.env.BACKUP_S3_PREFIX || "opencodehub-backups";
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10);
const INCREMENTAL = process.argv.includes("--incremental");
const LAST_BACKUP_FILE = join(backupDir, ".last-backup-timestamp");

mkdirSync(targetDir, { recursive: true });

console.log(
  `[Backup] Starting ${INCREMENTAL ? "incremental" : "full"} backup to ${targetDir}`,
);

// ── 1. Backup Database ────────────────────────────────────────────────────────
const dbDriver = process.env.DATABASE_DRIVER || "sqlite";
const dbUrl = process.env.DATABASE_URL || "data/opencodehub.db";

console.log(`[Backup] Backing up database (${dbDriver})...`);

try {
  if (dbDriver === "sqlite") {
    const dbPath = join(rootDir, dbUrl);
    if (existsSync(dbPath)) {
      try {
        // Use SQLite .backup for WAL-safe atomic backup
        execSync(
          `sqlite3 "${dbPath}" ".backup '${join(targetDir, "database.sqlite")}'"`,
          { timeout: 60_000 },
        );
        console.log(`[Backup] SQLite database backed up (atomic .backup).`);
      } catch {
        copyFileSync(dbPath, join(targetDir, "database.sqlite"));
        console.log(`[Backup] SQLite database copied (fallback).`);
      }
      // Copy WAL if exists
      if (existsSync(`${dbPath}-wal`)) {
        copyFileSync(`${dbPath}-wal`, join(targetDir, "database.sqlite-wal"));
      }
    } else {
      console.warn(`[Backup] SQLite database not found at ${dbPath}`);
    }
  } else if (dbDriver === "postgres") {
    const outputFile = join(targetDir, "dump.sql.gz");
    execSync(`pg_dump "${dbUrl}" | gzip > "${outputFile}"`, {
      timeout: 300_000,
    });
    console.log(`[Backup] Postgres dumped and compressed.`);
  } else if (dbDriver === "turso" || dbDriver === "libsql") {
    console.log(
      `[Backup] Turso/LibSQL: use "turso db dump" for cloud-hosted databases.`,
    );
  } else {
    console.log(
      `[Backup] Automatic backup not supported for driver: ${dbDriver}.`,
    );
  }
} catch (error) {
  console.error(`[Backup] Database backup failed:`, error);
}

// ── 2. Backup Repositories ────────────────────────────────────────────────────
const repoPath = process.env.GIT_STORAGE_PATH
  ? join(rootDir, process.env.GIT_STORAGE_PATH)
  : join(rootDir, "repos");

if (existsSync(repoPath)) {
  console.log(`[Backup] Backing up repositories from ${repoPath}...`);
  const repoArchive = join(targetDir, "repos.tar.gz");
  try {
    let newerThan = "";
    if (INCREMENTAL && existsSync(LAST_BACKUP_FILE)) {
      const lastTs = readFileSync(LAST_BACKUP_FILE, "utf-8").trim();
      newerThan = `--newer="${lastTs}"`;
    }
    execSync(
      `tar -czf "${repoArchive}" ${newerThan} -C "${dirname(repoPath)}" "${process.env.GIT_STORAGE_PATH || "repos"}"`,
      { timeout: 600_000 },
    );
    console.log(
      `[Backup] Repositories archived (${INCREMENTAL ? "incremental" : "full"}).`,
    );
  } catch (error) {
    console.error(`[Backup] Repository backup failed:`, error);
  }
} else {
  console.warn(`[Backup] Repository directory not found at ${repoPath}`);
}

// ── 3. Backup Config / Env ────────────────────────────────────────────────────
const envPath = join(rootDir, ".env");
if (existsSync(envPath)) {
  copyFileSync(envPath, join(targetDir, ".env.backup"));
  console.log(`[Backup] Environment file copied.`);
}
const storageConfigPath = join(rootDir, "data", "storage-config.json");
if (existsSync(storageConfigPath)) {
  copyFileSync(storageConfigPath, join(targetDir, "storage-config.json"));
}

// ── 4. Create Manifest ────────────────────────────────────────────────────────
const manifest = {
  version: "1.0",
  timestamp,
  type: INCREMENTAL ? "incremental" : "full",
  dbDriver,
  files: readdirSync(targetDir).map((f) => {
    const s = statSync(join(targetDir, f));
    return {
      name: f,
      size: s.size,
      checksum: createHash("sha256")
        .update(readFileSync(join(targetDir, f)))
        .digest("hex"),
    };
  }),
};
writeFileSync(
  join(targetDir, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(`[Backup] Manifest created.`);

// ── 5. Create final archive ──────────────────────────────────────────────────
const finalArchive = join(backupDir, `backup-${timestamp}.tar.gz`);
execSync(`tar -czf "${finalArchive}" -C "${backupDir}" "backup-${timestamp}"`, {
  timeout: 600_000,
});
console.log(`[Backup] Archive created: ${finalArchive}`);

// ── 6. Encrypt + Upload + Retention ──────────────────────────────────────────
async function encryptIfNeeded(): Promise<string> {
  if (ENCRYPTION_KEY && ENCRYPTION_KEY.length === 64) {
    console.log(`[Backup] Encrypting archive...`);
    const encryptedPath = `${finalArchive}.enc`;
    const iv = randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY, "hex");
    const cipher = createCipheriv("aes-256-cbc", key, iv);
    const output = createWriteStream(encryptedPath);
    output.write(iv);
    await pipeline(createReadStream(finalArchive), cipher, output);
    execSync(`rm "${finalArchive}"`);
    console.log(`[Backup] Encrypted: ${encryptedPath}`);
    return encryptedPath;
  } else if (ENCRYPTION_KEY) {
    console.warn(
      `[Backup] BACKUP_ENCRYPTION_KEY must be 64 hex chars. Skipping encryption.`,
    );
  }
  return finalArchive;
}

function uploadToS3(filePath: string) {
  if (!S3_BUCKET) return;
  const fileName = filePath.split("/").pop();
  const s3Key = `${S3_PREFIX}/${fileName}`;
  console.log(`[Backup] Uploading to s3://${S3_BUCKET}/${s3Key}...`);
  try {
    execSync(`aws s3 cp "${filePath}" "s3://${S3_BUCKET}/${s3Key}"`, {
      timeout: 600_000,
    });
    console.log(`[Backup] Uploaded to S3 successfully.`);
  } catch (error) {
    console.error(`[Backup] S3 upload failed:`, error);
  }
}

function enforceRetention() {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const entries = readdirSync(backupDir).filter((f) =>
      f.startsWith("backup-"),
    );
    let deleted = 0;
    for (const entry of entries) {
      if (entry.includes(timestamp)) continue;
      const entryPath = join(backupDir, entry);
      const stats = statSync(entryPath);
      if (stats.mtime < cutoff) {
        execSync(`rm -rf "${entryPath}"`);
        deleted++;
      }
    }
    if (deleted > 0) {
      console.log(
        `[Backup] Retention: deleted ${deleted} old backup(s) (>${RETENTION_DAYS} days).`,
      );
    }
  } catch (error) {
    console.error(`[Backup] Retention cleanup failed:`, error);
  }
}

(async () => {
  const uploadPath = await encryptIfNeeded();
  uploadToS3(uploadPath);
  enforceRetention();
  writeFileSync(LAST_BACKUP_FILE, new Date().toISOString());
  execSync(`rm -rf "${targetDir}"`);
  console.log(`[Backup] ✅ Completed successfully.`);
})().catch((err) => {
  console.error(`[Backup] Fatal error:`, err);
  process.exit(1);
});
