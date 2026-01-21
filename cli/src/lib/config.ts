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
}

const config = new Conf<OchConfig>({
    projectName: "opencodehub-cli",
    defaults: {
        serverUrl: "http://localhost:4321",
        token: "",
        defaultBranch: "main",
    },
});

export function getConfig(): OchConfig {
    return {
        serverUrl: config.get("serverUrl"),
        token: config.get("token"),
        username: config.get("username"),
        defaultBranch: config.get("defaultBranch"),
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
}

export function clearConfig(): void {
    config.clear();
}
