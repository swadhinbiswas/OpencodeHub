import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { getStorageConfig } from "./storage";

const RCLONE_BIN = "rclone";
const DEFAULT_CONFIG_PATH = path.join(process.cwd(), "data", "rclone", "rclone.conf");

export interface SyncOptions {
    dryRun?: boolean;
    delete?: boolean; // --delete-during
    verbose?: boolean;
}

export interface SyncResult {
    success: boolean;
    output: string;
    error?: string;
}

/**
 * Get the path to the rclone config file
 */
function getConfigPath(): string {
    return process.env.RCLONE_CONFIG_PATH || DEFAULT_CONFIG_PATH;
}

/**
 * Ensure rclone config directory exists
 */
export async function ensureRcloneConfig(): Promise<void> {
    const configPath = getConfigPath();
    const dir = path.dirname(configPath);
    try {
        await fs.mkdir(dir, { recursive: true });
        // If config doesn't exist, create an empty one
        try {
            await fs.access(configPath);
        } catch {
            await fs.writeFile(configPath, "# Rclone configuration file\n");
        }
    } catch (err) {
        console.error("Failed to ensure rclone config:", err);
    }
}

/**
 * Run rclone sync from local to remote
 * @param sourcePath Local path (relative to project root or absolute)
 * @param remoteDest Remote destination (remote:path)
 */
export async function syncStorage(
    sourcePath: string,
    remoteDest: string,
    options: SyncOptions = {}
): Promise<SyncResult> {
    const configPath = getConfigPath();

    // Resolve source path
    const resolvedSource = path.isAbsolute(sourcePath)
        ? sourcePath
        : path.join(process.cwd(), sourcePath);

    const args = [
        "sync",
        resolvedSource,
        remoteDest,
        "--config", configPath,
        "--progress",
    ];

    if (options.dryRun) args.push("--dry-run");
    if (options.delete !== false) args.push("--delete-during"); // Default to delete
    if (options.verbose) args.push("-v");

    return runRclone(args);
}

/**
 * Run rclone sync from remote to local
 */
export async function restoreStorage(
    remoteSource: string,
    destPath: string,
    options: SyncOptions = {}
): Promise<SyncResult> {
    const configPath = getConfigPath();

    // Resolve dest path
    const resolvedDest = path.isAbsolute(destPath)
        ? destPath
        : path.join(process.cwd(), destPath);

    const args = [
        "sync",
        remoteSource,
        resolvedDest,
        "--config", configPath,
        "--progress",
    ];

    if (options.dryRun) args.push("--dry-run");
    if (options.delete !== false) args.push("--delete-during");
    if (options.verbose) args.push("-v");

    return runRclone(args);
}

/**
 * List configured remotes
 */
export async function listRemotes(): Promise<string[]> {
    const configPath = getConfigPath();
    const result = await runRclone(["listremotes", "--config", configPath]);

    if (result.success) {
        return result.output
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean)
            .map(remote => remote.replace(":", ""));
    }
    return [];
}

/**
 * Internal helper to run rclone command
 */
async function runRclone(args: string[]): Promise<SyncResult> {
    console.log(`[Rclone] Running: rclone ${args.join(" ")}`);

    return new Promise((resolve) => {
        const proc = spawn(RCLONE_BIN, args);
        let output = "";
        let error = "";

        proc.stdout.on("data", (data) => { output += data.toString(); });
        proc.stderr.on("data", (data) => { error += data.toString(); });

        proc.on("close", (code) => {
            if (code === 0) {
                resolve({ success: true, output });
            } else {
                console.error(`[Rclone] Failed with code ${code}: ${error}`);
                resolve({ success: false, output, error: error || "Process failed" });
            }
        });

        proc.on("error", (err) => {
            resolve({ success: false, output: "", error: `Failed to spawn rclone: ${err.message}` });
        });
    });
}
