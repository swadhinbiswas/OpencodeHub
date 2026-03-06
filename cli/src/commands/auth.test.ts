import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type AuthModule = typeof import("./auth.js");
type ConfigModule = typeof import("../lib/config.js");

let authMod: AuthModule;
let configMod: ConfigModule;

beforeAll(async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "och-cli-auth-test-"));
  process.env.XDG_CONFIG_HOME = tmpDir;
  process.env.XDG_DATA_HOME = tmpDir;
  process.env.OCH_DISABLE_KEYCHAIN = "1";
  process.env.CI = "1";

  configMod = await import("../lib/config.js");
  authMod = await import("./auth.js");
});

beforeEach(() => {
  configMod.clearConfig();
  vi.restoreAllMocks();
});

describe("auth commands", () => {
  it("status reports unauthenticated when token is missing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await authMod.authCommands.parseAsync(["status"], {
      from: "user",
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Not authenticated"));
  });

  it("login with token stores username and token", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { username: "alice" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await authMod.authCommands.parseAsync(
      [
        "login",
        "--url",
        "https://git.example.com",
        "--token",
        "token_12345678",
      ],
      { from: "user" },
    );

    const cfg = configMod.getConfig();
    expect(cfg.serverUrl).toBe("https://git.example.com");
    expect(cfg.username).toBe("alice");
    expect(cfg.token).toBe("token_12345678");
    expect(fetchMock).toHaveBeenCalled();
  });
});
