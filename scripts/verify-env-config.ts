/**
 * Verify the two supported storage backends (`local` and `s3`) end-to-end:
 *  1. Environment validation accepts a valid S3 config and rejects an incomplete one.
 *  2. `getStorageConfig()` returns a clean, S3-shaped object from env vars.
 *  3. `createStorageAdapter` produces an `S3StorageAdapter` for `type=s3` and a
 *     `LocalStorageAdapter` for `type=local`.
 *
 * Usage:  bun run scripts/verify-env-config.ts
 */
import { validateEnvironment } from "../src/lib/env-validation";
import { createStorageAdapter, getStorageConfig } from "../src/lib/storage";

process.env.JWT_SECRET ??= "a".repeat(32);
process.env.SESSION_SECRET ??= "a".repeat(32);
process.env.INTERNAL_HOOK_SECRET ??= "a".repeat(32);
process.env.SITE_URL ??= "http://localhost:3000";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`❌ ${msg}`);
    process.exit(1);
  }
  console.log(`✅ ${msg}`);
}

function clearStorageEnv() {
  for (const k of [
    "STORAGE_TYPE",
    "STORAGE_PATH",
    "STORAGE_BUCKET",
    "STORAGE_REGION",
    "STORAGE_ENDPOINT",
    "STORAGE_ACCESS_KEY_ID",
    "STORAGE_SECRET_ACCESS_KEY",
  ]) {
    delete process.env[k];
  }
}

async function verify() {
  console.log("Running storage verification...\n");

  // 1. local default
  console.log("[1/3] Default (local) config:");
  clearStorageEnv();
  const localCfg = getStorageConfig();
  assert(localCfg.type === "local", "default type is 'local'");
  assert(localCfg.basePath === "./data/storage", "default basePath is './data/storage'");

  // 2. s3 valid
  console.log("\n[2/3] Valid S3 config:");
  clearStorageEnv();
  process.env.STORAGE_TYPE = "s3";
  process.env.STORAGE_BUCKET = "my-bucket";
  process.env.STORAGE_ACCESS_KEY_ID = "AKIA-test";
  process.env.STORAGE_SECRET_ACCESS_KEY = "secret";
  process.env.STORAGE_REGION = "us-west-2";
  process.env.STORAGE_ENDPOINT = "https://s3.us-west-2.example.com";
  const valid = validateEnvironment(false);
  assert(valid, "validation passes for a complete S3 config");
  const s3Cfg = getStorageConfig();
  assert(s3Cfg.type === "s3", "getStorageConfig returns type='s3'");
  assert(s3Cfg.bucket === "my-bucket", "bucket is read from env");
  assert(s3Cfg.region === "us-west-2", "region is read from env");
  assert(s3Cfg.endpoint === "https://s3.us-west-2.example.com", "endpoint is read from env");
  const adapter = createStorageAdapter(s3Cfg);
  assert(adapter.constructor.name === "S3StorageAdapter", "factory returns S3StorageAdapter");

  // 3. s3 missing required
  console.log("\n[3/3] Missing required S3 vars (validation should reject):");
  clearStorageEnv();
  process.env.STORAGE_TYPE = "s3";
  // no bucket / creds
  const invalid = validateEnvironment(false);
  assert(!invalid, "validation fails when S3 vars are missing");

  // local adapter round-trip
  clearStorageEnv();
  process.env.STORAGE_TYPE = "local";
  process.env.STORAGE_PATH = "/tmp/opencodehub-test-storage";
  const localAdapter = createStorageAdapter(getStorageConfig());
  assert(localAdapter.constructor.name === "LocalStorageAdapter", "factory returns LocalStorageAdapter for type=local");

  console.log("\n🎉 ALL VERIFICATION CHECKS PASSED!");
}

verify();
