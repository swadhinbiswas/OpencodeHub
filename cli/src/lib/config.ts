/**
 * CLI Configuration
 * Store and retrieve CLI settings
 */

import Conf from "conf";
import { execFileSync } from "node:child_process";

export interface OchConfig {
  serverUrl: string;
  token?: string;
  username?: string;
  defaultBranch?: string;
  editor?: string;
  pager?: string;
  caFile?: string;
  insecure?: boolean;
  windowsEncryptedTokens?: Record<string, string>;
}

export function normalizeServerUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid server URL. Use a full URL like https://git.example.com");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid server URL protocol. Only http:// or https:// are supported");
  }

  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

const config = new Conf<OchConfig>({
  projectName: "opencodehub-cli",
  defaults: {
    serverUrl: "",
    defaultBranch: "main",
    editor: "",
    pager: "",
    caFile: "",
    insecure: false,
  },
});

function sanitizeAccountName(input: string) {
  return input.replace(/[^a-zA-Z0-9._:@/-]/g, "_");
}

function keychainAccount(serverUrl?: string) {
  return sanitizeAccountName(serverUrl?.trim() || "default");
}

function hasCommand(command: string) {
  if (process.env.OCH_DISABLE_KEYCHAIN === "1") {
    return false;
  }
  try {
    if (process.platform === "win32") {
      execFileSync("where", [command], { stdio: "ignore", timeout: 500 });
    } else {
      execFileSync("sh", ["-lc", `command -v ${command} >/dev/null 2>&1`], {
        stdio: "ignore",
        timeout: 500,
      });
    }
    return true;
  } catch {
    return false;
  }
}

function getWindowsEncryptedTokens(): Record<string, string> {
  return (config.get("windowsEncryptedTokens") || {}) as Record<string, string>;
}

function encryptWindowsToken(token: string): string | null {
  if (!hasCommand("powershell")) return null;
  try {
    return execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop';$plain=[Console]::In.ReadToEnd();$sec=ConvertTo-SecureString $plain -AsPlainText -Force;$enc=$sec | ConvertFrom-SecureString;[Console]::Out.Write($enc)",
      ],
      {
        input: token,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 2000,
      },
    ).trim();
  } catch {
    return null;
  }
}

function decryptWindowsToken(encryptedValue: string): string | null {
  if (!hasCommand("powershell")) return null;
  try {
    return execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop';$enc=[Console]::In.ReadToEnd();$sec=ConvertTo-SecureString $enc;$bstr=[System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec);try{[System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)}finally{[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)}",
      ],
      {
        input: encryptedValue,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 2000,
      },
    ).trim();
  } catch {
    return null;
  }
}

function getTokenFromKeychain(serverUrl?: string): string | null {
  const account = keychainAccount(serverUrl);

  try {
    if (process.platform === "win32") {
      const encrypted = getWindowsEncryptedTokens()[account];
      if (!encrypted) return null;
      return decryptWindowsToken(encrypted);
    }

    if (process.platform === "darwin" && hasCommand("security")) {
      return execFileSync(
        "security",
        [
          "find-generic-password",
          "-s",
          "opencodehub-cli",
          "-a",
          account,
          "-w",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 1000 },
      ).trim();
    }

    if (process.platform === "linux" && hasCommand("secret-tool")) {
      const value = execFileSync(
        "secret-tool",
        ["lookup", "service", "opencodehub-cli", "account", account],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 1000 },
      ).trim();
      return value || null;
    }
  } catch {
    return null;
  }

  return null;
}

function saveTokenToKeychain(serverUrl: string | undefined, token: string): boolean {
  const account = keychainAccount(serverUrl);

  try {
    if (process.platform === "win32") {
      const encrypted = encryptWindowsToken(token);
      if (!encrypted) return false;
      const current = getWindowsEncryptedTokens();
      current[account] = encrypted;
      config.set("windowsEncryptedTokens", current);
      return true;
    }

    if (process.platform === "darwin" && hasCommand("security")) {
      execFileSync(
        "security",
        [
          "add-generic-password",
          "-U",
          "-s",
          "opencodehub-cli",
          "-a",
          account,
          "-w",
          token,
        ],
        { stdio: "ignore", timeout: 1000 },
      );
      return true;
    }

    if (process.platform === "linux" && hasCommand("secret-tool")) {
      execFileSync(
        "secret-tool",
        [
          "store",
          "--label=OpenCodeHub CLI Token",
          "service",
          "opencodehub-cli",
          "account",
          account,
        ],
        { input: token, stdio: ["pipe", "ignore", "ignore"], timeout: 1000 },
      );
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function removeTokenFromKeychain(serverUrl?: string): void {
  const account = keychainAccount(serverUrl);

  try {
    if (process.platform === "win32") {
      const current = getWindowsEncryptedTokens();
      if (current[account]) {
        delete current[account];
        config.set("windowsEncryptedTokens", current);
      }
      return;
    }

    if (process.platform === "darwin" && hasCommand("security")) {
      execFileSync(
        "security",
        ["delete-generic-password", "-s", "opencodehub-cli", "-a", account],
        { stdio: "ignore", timeout: 1000 },
      );
      return;
    }

    if (process.platform === "linux" && hasCommand("secret-tool")) {
      execFileSync(
        "secret-tool",
        ["clear", "service", "opencodehub-cli", "account", account],
        { stdio: "ignore", timeout: 1000 },
      );
    }
  } catch {
    // No-op: if key is absent or provider is unavailable we still clear fallback storage.
  }
}

function getToken(serverUrl?: string): string {
  const envToken = process.env.OCH_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  const keychainToken = getTokenFromKeychain(serverUrl);
  if (keychainToken) {
    return keychainToken;
  }

  return config.get("token") || "";
}

export function getConfig(): OchConfig {
  return {
    serverUrl: config.get("serverUrl") || "",
    token: getToken(config.get("serverUrl")),
    username: config.get("username"),
    defaultBranch: config.get("defaultBranch") || "main",
    editor: config.get("editor") || "",
    pager: config.get("pager") || "",
    caFile: config.get("caFile") || "",
    insecure: config.get("insecure") ?? false,
  };
}

export function saveConfig(updates: Partial<OchConfig>): void {
  if (updates.serverUrl !== undefined) {
    config.set("serverUrl", normalizeServerUrl(updates.serverUrl));
  }
  if (updates.token !== undefined) {
    const token = updates.token.trim();
    if (!token) {
      removeTokenFromKeychain(updates.serverUrl || config.get("serverUrl"));
      config.delete("token");
    } else {
      const storedInKeychain = saveTokenToKeychain(
        updates.serverUrl || config.get("serverUrl"),
        token,
      );

      if (storedInKeychain) {
        config.delete("token");
      } else {
        config.set("token", token);
      }
    }
  }
  if (updates.username !== undefined) {
    config.set("username", updates.username);
  }
  if (updates.defaultBranch !== undefined) {
    config.set("defaultBranch", updates.defaultBranch);
  }
  if (updates.editor !== undefined) {
    config.set("editor", updates.editor);
  }
  if (updates.pager !== undefined) {
    config.set("pager", updates.pager);
  }
  if (updates.caFile !== undefined) {
    config.set("caFile", updates.caFile);
  }
  if (updates.insecure !== undefined) {
    config.set("insecure", updates.insecure);
  }
}

export function clearConfig(): void {
  removeTokenFromKeychain(config.get("serverUrl"));
  config.clear();
}

export function unsetConfigKey(
  key: "serverUrl" | "token" | "username" | "defaultBranch" | "editor" | "pager" | "caFile" | "insecure",
): void {
  if (key === "token") {
    removeTokenFromKeychain(config.get("serverUrl"));
  }
  config.delete(key);
}

export function getConfigPath(): string {
  return config.path;
}

export function getTokenStorageMode(serverUrl?: string): "env" | "keychain" | "file" | "none" {
  if (process.env.OCH_TOKEN?.trim()) return "env";
  if (getTokenFromKeychain(serverUrl || config.get("serverUrl"))) return "keychain";
  if (config.get("token")) return "file";
  return "none";
}

export function supportsSecureTokenStorage(): boolean {
  if (process.platform === "win32") return hasCommand("powershell");
  if (process.platform === "darwin") return hasCommand("security");
  if (process.platform === "linux") return hasCommand("secret-tool");
  return false;
}
