import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

type ConfigModule = typeof import("./config.js");

let mod: ConfigModule;

beforeAll(async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "och-cli-config-test-"));
  process.env.XDG_CONFIG_HOME = tmpDir;
  process.env.XDG_DATA_HOME = tmpDir;
  process.env.OCH_TOKEN = "";
  process.env.OCH_DISABLE_KEYCHAIN = "1";
  mod = await import("./config.js");
});

describe("config library", () => {
  it("persists and unsets non-secret config keys", () => {
    mod.clearConfig();
    mod.saveConfig({ serverUrl: "https://git.example.com", defaultBranch: "develop" });

    const loaded = mod.getConfig();
    expect(loaded.serverUrl).toBe("https://git.example.com");
    expect(loaded.defaultBranch).toBe("develop");

    mod.unsetConfigKey("serverUrl");
    expect(mod.getConfig().serverUrl).toBe("");
  });

  it("prefers OCH_TOKEN environment variable over persisted token", () => {
    mod.clearConfig();
    process.env.OCH_TOKEN = "env_token_override_123";
    mod.saveConfig({ token: "file_token_123456" });

    const loaded = mod.getConfig();
    expect(loaded.token).toBe("env_token_override_123");
    expect(mod.getTokenStorageMode(loaded.serverUrl)).toBe("env");
  });

  it("normalizes and validates server URLs", () => {
    expect(mod.normalizeServerUrl(" https://git.example.com/ ")).toBe(
      "https://git.example.com",
    );
    expect(mod.normalizeServerUrl("https://git.example.com/base///")).toBe(
      "https://git.example.com/base",
    );
    expect(() => mod.normalizeServerUrl("git.example.com")).toThrow(
      /Invalid server URL/,
    );
    expect(() => mod.normalizeServerUrl("ftp://git.example.com")).toThrow(
      /Invalid server URL protocol/,
    );
  });
});
