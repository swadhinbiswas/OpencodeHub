import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ConfigCommandModule = typeof import("./config/index.js");
type ConfigModule = typeof import("../lib/config.js");

let configCommandMod: ConfigCommandModule;
let configMod: ConfigModule;

beforeAll(async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "och-cli-config-cmd-test-"));
  process.env.XDG_CONFIG_HOME = tmpDir;
  process.env.XDG_DATA_HOME = tmpDir;
  process.env.OCH_DISABLE_KEYCHAIN = "1";

  configMod = await import("../lib/config.js");
  configCommandMod = await import("./config/index.js");
});

beforeEach(() => {
  configMod.clearConfig();
  vi.restoreAllMocks();
});

describe("config doctor command", () => {
  it("exits with code 1 when required config is missing", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`EXIT_${code ?? 0}`);
      }) as any);

    await expect(
      configCommandMod.configCommands.parseAsync(
        ["doctor"],
        { from: "user" },
      ),
    ).rejects.toThrow("EXIT_1");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("succeeds when server and token are valid", async () => {
    configMod.saveConfig({
      serverUrl: "https://git.example.com",
      token: "token_12345678",
    });

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { username: "alice" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("UNEXPECTED_EXIT");
    }) as any);

    await configCommandMod.configCommands.parseAsync(
      ["doctor"],
      { from: "user" },
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
