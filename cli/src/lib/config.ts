/**
 * CLI Configuration
 * Store and retrieve CLI settings
 */

import Conf from "conf";

interface OchConfig {
  serverUrl: string;
  token: string;
  username?: string;
  defaultBranch?: string;
  caFile?: string;
  insecure?: boolean;
}

const config = new Conf<OchConfig>({
  projectName: "opencodehub-cli",
  defaults: {
    serverUrl: "",
    token: "",
    defaultBranch: "main",
    caFile: "",
    insecure: false,
  },
});

export function getConfig(): OchConfig {
  return {
    serverUrl: config.get("serverUrl"),
    token: config.get("token"),
    username: config.get("username"),
    defaultBranch: config.get("defaultBranch"),
    caFile: config.get("caFile"),
    insecure: config.get("insecure"),
  };
}

export function saveConfig(updates: Partial<OchConfig>): void {
  if (updates.serverUrl !== undefined) {
    config.set("serverUrl", updates.serverUrl);
  }
  if (updates.token !== undefined) {
    config.set("token", updates.token);
  }
  if (updates.username !== undefined) {
    config.set("username", updates.username);
  }
  if (updates.defaultBranch !== undefined) {
    config.set("defaultBranch", updates.defaultBranch);
  }
  if (updates.caFile !== undefined) {
    config.set("caFile", updates.caFile);
  }
  if (updates.insecure !== undefined) {
    config.set("insecure", updates.insecure);
  }
}

export function clearConfig(): void {
  config.clear();
}
