/**
 * OpenCodeHub Restore Script
 *
 * Restores from a backup archive created by backup.ts.
 *
 * Usage:
 *   npx tsx scripts/restore.ts <backup-archive>
 *   npx tsx scripts/restore.ts backups/backup-2025-01-15T10-30-00-000Z.tar.gz
 *   npx tsx scripts/restore.ts backups/backup-2025-01-15T10-30-00-000Z.tar.gz.enc
 *
 * Environment Variables:
 *   BACKUP_ENCRYPTION_KEY - Required if restoring encrypted backup
 *   RESTORE_DB            - Set to "true" to restore database (default: true)
 *   RESTORE_REPOS         - Set to "true" to restore repos (default: true)
 *   RESTORE_ENV           - Set to "true" to restore .env (default: false — safety)
 */

import { execSync } from "child_process";
import { createDecipheriv } from "crypto";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const archivePath = process.argv[2];
if (!archivePath) {
  console.error("Usage: npx tsx scripts/restore.ts <backup-archive>");
  console.error(
    "Example: npx tsx scripts/restore.ts backups/backup-2025-01-15.tar.gz",
  );
  process.exit(1);
}

const fullArchivePath = archivePath.startsWith("/")
  ? archivePath
  : join(process.cwd(), archivePath);

if (!existsSync(fullArchivePath)) {
  console.error(`[Restore] Archive not found: ${fullArchivePath}`);
  process.exit(1);
}

const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || "";
const RESTORE_DB = process.env.RESTORE_DB !== "false";
const RESTORE_REPOS = process.env.RESTORE_REPOS !== "false";
const RESTORE_ENV = process.env.RESTORE_ENV === "true";

const tempRestoreDir = join(rootDir, "backups", `restore-${Date.now()}`);
mkdirSync(tempRestoreDir, { recursive: true });

async function decryptIfNeeded(inputPath: string): Promise<string> {
  if (!inputPath.endsWith(".enc")) return inputPath;

  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    console.error(
      "[Restore] Encrypted backup detected but BACKUP_ENCRYPTION_KEY not set or invalid.",
    );
    process.exit(1);
  }

  console.log("[Restore] Decrypting archive...");
  const decryptedPath = inputPath.replace(".enc", "");
  const key = Buffer.from(ENCRYPTION_KEY, "hex");

  // Read IV from first 16 bytes
  const fd = readFileSync(inputPath);
  const iv = fd.subarray(0, 16);
  const encryptedData = fd.subarray(16);

  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);
  const output = createWriteStream(decryptedPath);
  output.write(decrypted);
  output.end();
  await new Promise<void>((resolve) => output.on("finish", resolve));

  console.log("[Restore] Decrypted successfully.");
  return decryptedPath;
}

async function main() {
  console.log(`[Restore] Restoring from: ${fullArchivePath}`);
  console.log(
    `[Restore] Options: DB=${RESTORE_DB}, Repos=${RESTORE_REPOS}, Env=${RESTORE_ENV}`,
  );

  // Step 1: Decrypt if needed
  const tarPath = await decryptIfNeeded(fullArchivePath);

  // Step 2: Extract archive
  console.log("[Restore] Extracting archive...");
  execSync(`tar -xzf "${tarPath}" -C "${tempRestoreDir}"`, {
    timeout: 600_000,
  });

  // Find the extracted backup directory
  const entries = execSync(`ls "${tempRestoreDir}"`)
    .toString()
    .trim()
    .split("\n");
  const backupDirName =
    entries.find((e) => e.startsWith("backup-")) || entries[0];
  const extractedDir = join(tempRestoreDir, backupDirName);

  // Step 3: Verify manifest
  const manifestPath = join(extractedDir, "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    console.log(
      `[Restore] Manifest: type=${manifest.type}, timestamp=${manifest.timestamp}, driver=${manifest.dbDriver}`,
    );
    console.log(
      `[Restore] Files: ${manifest.files?.map((f: any) => f.name).join(", ")}`,
    );
  } else {
    console.warn(
      "[Restore] No manifest.json found in backup. Proceeding anyway...",
    );
  }

  // Step 4: Restore database
  if (RESTORE_DB) {
    const dbDriver = process.env.DATABASE_DRIVER || "sqlite";

    if (dbDriver === "sqlite") {
      const backupDb = join(extractedDir, "database.sqlite");
      if (existsSync(backupDb)) {
        const targetDb = join(
          rootDir,
          process.env.DATABASE_URL || "data/opencodehub.db",
        );
        mkdirSync(dirname(targetDb), { recursive: true });

        // Stop app first if running
        console.log("[Restore] Restoring SQLite database...");
        copyFileSync(backupDb, targetDb);

        const walBackup = join(extractedDir, "database.sqlite-wal");
        if (existsSync(walBackup)) {
          copyFileSync(walBackup, `${targetDb}-wal`);
        }
        console.log("[Restore] SQLite database restored.");
      } else {
        console.warn("[Restore] No database.sqlite found in backup.");
      }
    } else if (dbDriver === "postgres") {
      const dumpFile = join(extractedDir, "dump.sql.gz");
      const plainDump = join(extractedDir, "dump.sql");
      if (existsSync(dumpFile)) {
        console.log("[Restore] Restoring PostgreSQL database...");
        const dbUrl = process.env.DATABASE_URL || "";
        execSync(`gunzip -c "${dumpFile}" | psql "${dbUrl}"`, {
          timeout: 300_000,
        });
        console.log("[Restore] PostgreSQL database restored.");
      } else if (existsSync(plainDump)) {
        const dbUrl = process.env.DATABASE_URL || "";
        execSync(`psql "${dbUrl}" < "${plainDump}"`, { timeout: 300_000 });
        console.log("[Restore] PostgreSQL database restored (plain SQL).");
      } else {
        console.warn("[Restore] No database dump found in backup.");
      }
    }
  }

  // Step 5: Restore repositories
  if (RESTORE_REPOS) {
    const repoArchive = join(extractedDir, "repos.tar.gz");
    if (existsSync(repoArchive)) {
      const repoTarget = process.env.GIT_STORAGE_PATH
        ? dirname(join(rootDir, process.env.GIT_STORAGE_PATH))
        : rootDir;
      console.log("[Restore] Restoring repositories...");
      execSync(`tar -xzf "${repoArchive}" -C "${repoTarget}"`, {
        timeout: 600_000,
      });
      console.log("[Restore] Repositories restored.");
    } else {
      console.warn("[Restore] No repos.tar.gz found in backup.");
    }
  }

  // Step 6: Restore .env (opt-in only)
  if (RESTORE_ENV) {
    const envBackup = join(extractedDir, ".env.backup");
    if (existsSync(envBackup)) {
      const envTarget = join(rootDir, ".env");
      if (existsSync(envTarget)) {
        copyFileSync(envTarget, `${envTarget}.pre-restore`);
        console.log("[Restore] Existing .env backed up to .env.pre-restore");
      }
      copyFileSync(envBackup, envTarget);
      console.log("[Restore] .env file restored.");
    }
  }

  // Cleanup temp directory
  execSync(`rm -rf "${tempRestoreDir}"`);

  console.log("[Restore] ✅ Restore completed successfully.");
  console.log("[Restore] Please restart the application to apply changes.");
}

main().catch((err) => {
  console.error("[Restore] Fatal error:", err);
  execSync(`rm -rf "${tempRestoreDir}"`);
  process.exit(1);
});
