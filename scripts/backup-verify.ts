/**
 * OpenCodeHub Backup Verification Script
 *
 * Verifies backup integrity by checking:
 * - Archive can be extracted
 * - Manifest exists and is valid JSON
 * - All files listed in manifest are present
 * - SHA-256 checksums match
 *
 * Usage:
 *   npx tsx scripts/backup-verify.ts <backup-archive>
 *   npx tsx scripts/backup-verify.ts backups/backup-2025-01-15.tar.gz
 */

import { execSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const archivePath = process.argv[2];
if (!archivePath) {
  console.error("Usage: npx tsx scripts/backup-verify.ts <backup-archive>");
  process.exit(1);
}

const fullPath = archivePath.startsWith("/")
  ? archivePath
  : join(process.cwd(), archivePath);

if (!existsSync(fullPath)) {
  console.error(`[Verify] Archive not found: ${fullPath}`);
  process.exit(1);
}

const tempDir = join(rootDir, "backups", `verify-${Date.now()}`);
mkdirSync(tempDir, { recursive: true });

let exitCode = 0;

function pass(msg: string) {
  console.log(`  ✅ ${msg}`);
}
function fail(msg: string) {
  console.log(`  ❌ ${msg}`);
  exitCode = 1;
}

try {
  console.log(`[Verify] Verifying: ${fullPath}`);
  console.log();

  // 1. Can we extract?
  console.log("── 1. Archive Extraction ────────────────────");
  try {
    if (fullPath.endsWith(".enc")) {
      fail(
        "Encrypted archives require decryption first. Use restore.ts or provide BACKUP_ENCRYPTION_KEY.",
      );
    } else {
      execSync(`tar -xzf "${fullPath}" -C "${tempDir}"`, { timeout: 120_000 });
      pass("Archive extracted successfully.");
    }
  } catch (err) {
    fail(`Archive extraction failed: ${err}`);
    process.exit(1);
  }

  // Find backup dir
  const entries = readdirSync(tempDir);
  const backupDirName =
    entries.find((e) => e.startsWith("backup-")) || entries[0];
  const extractedDir = join(tempDir, backupDirName);

  // 2. Manifest
  console.log("── 2. Manifest Validation ──────────────────");
  const manifestPath = join(extractedDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    fail("No manifest.json found in backup.");
  } else {
    let manifest: any;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      pass(
        `Manifest is valid JSON (version=${manifest.version}, type=${manifest.type}).`,
      );
    } catch {
      fail("manifest.json is not valid JSON.");
      manifest = null;
    }

    // 3. File presence
    console.log("── 3. File Presence ────────────────────────");
    if (manifest?.files) {
      for (const file of manifest.files) {
        const filePath = join(extractedDir, file.name);
        if (existsSync(filePath)) {
          const actualSize = statSync(filePath).size;
          if (actualSize === file.size) {
            pass(`${file.name} (${formatBytes(file.size)})`);
          } else {
            fail(
              `${file.name} size mismatch: expected ${file.size}, got ${actualSize}`,
            );
          }
        } else {
          fail(`${file.name} is MISSING`);
        }
      }
    } else {
      fail("No files array in manifest.");
    }

    // 4. Checksum verification
    console.log("── 4. Checksum Verification ────────────────");
    if (manifest?.files) {
      for (const file of manifest.files) {
        if (!file.checksum) {
          console.log(`  ⚠️  ${file.name}: no checksum recorded`);
          continue;
        }
        const filePath = join(extractedDir, file.name);
        if (!existsSync(filePath)) continue;

        const actual = createHash("sha256")
          .update(readFileSync(filePath))
          .digest("hex");
        if (actual === file.checksum) {
          pass(`${file.name} SHA-256 OK`);
        } else {
          fail(
            `${file.name} SHA-256 MISMATCH! Expected ${file.checksum.substring(0, 16)}... got ${actual.substring(0, 16)}...`,
          );
        }
      }
    }

    // 5. Content checks
    console.log("── 5. Content Checks ───────────────────────");
    const dbFile = join(extractedDir, "database.sqlite");
    const dumpFile = join(extractedDir, "dump.sql.gz");
    const repoFile = join(extractedDir, "repos.tar.gz");

    if (existsSync(dbFile)) {
      const size = statSync(dbFile).size;
      if (size > 0) pass(`database.sqlite: ${formatBytes(size)}`);
      else fail("database.sqlite is empty (0 bytes)");
    } else if (existsSync(dumpFile)) {
      const size = statSync(dumpFile).size;
      if (size > 0) pass(`dump.sql.gz: ${formatBytes(size)}`);
      else fail("dump.sql.gz is empty (0 bytes)");
    } else {
      console.log("  ⚠️  No database backup found");
    }

    if (existsSync(repoFile)) {
      const size = statSync(repoFile).size;
      if (size > 0) pass(`repos.tar.gz: ${formatBytes(size)}`);
      else fail("repos.tar.gz is empty (0 bytes)");
    } else {
      console.log("  ⚠️  No repository backup found");
    }
  }

  console.log();
  if (exitCode === 0) {
    console.log("[Verify] ✅ Backup verification PASSED — all checks OK.");
  } else {
    console.log("[Verify] ❌ Backup verification FAILED — see errors above.");
  }
} finally {
  execSync(`rm -rf "${tempDir}"`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

process.exit(exitCode);
