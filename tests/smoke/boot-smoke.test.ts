/**
 * Smoke: boot-critical module wiring
 *
 * Fast checks that the app's foundation modules (env validation, DB factory,
 * storage factory, auth primitives) initialize correctly on a clean boot.
 * These run in seconds and catch import-time/dependency regressions.
 */
import { describe, expect, it } from "vitest";

describe("boot smoke: environment validation", () => {
  it("validates environment without throwing when values are defaulted", async () => {
    const { validateEnvironment } = await import("@/lib/env-validation");
    // Must return boolean (true when valid, false when invalid) — never throw
    const result = validateEnvironment(false);
    expect(typeof result).toBe("boolean");
  });
});

describe("boot smoke: storage factory", () => {
  it("resolves the local adapter and exposes the StorageAdapter interface", async () => {
    const { getStorage, LocalStorageAdapter } = await import(
      "@/lib/storage"
    );
    expect(LocalStorageAdapter).toBeTruthy();
    const storage = await getStorage();
    expect(storage).toBeTruthy();
    // Core interface methods exist
    for (const m of ["put", "get", "delete", "exists", "list"]) {
      expect(typeof (storage as any)[m], `missing method ${m}`).toBe(
        "function",
      );
    }
  });

  it("reports a valid storage type", async () => {
    const { getStorageConfig } = await import("@/lib/storage");
    expect(["local", "s3"]).toContain(getStorageConfig().type);
  });
});

describe("boot smoke: db factory", () => {
  it("reports a valid driver type without connecting", async () => {
    const { getDriverType } = await import("@/db");
    expect(["postgres", "sqlite", "libsql"]).toContain(getDriverType());
  });
});

describe("boot smoke: auth primitives", () => {
  it("exposes password hashing and verification", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth");
    const hash = await hashPassword("smoke-test-password-123");
    expect(hash).not.toBe("smoke-test-password-123");
    expect(hash.length).toBeGreaterThan(20);
    expect(await verifyPassword("smoke-test-password-123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("boot smoke: git utilities", () => {
  it("imports the git wrapper without native module errors", async () => {
    const mod = await import("@/lib/git");
    expect(mod).toBeTruthy();
    expect(typeof mod.getGit).toBe("function");
  });
});
