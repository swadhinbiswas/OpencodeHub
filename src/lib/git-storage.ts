/**
 * Git Storage Manager
 * 
 * Handles synchronization between cloud storage (Google Drive, etc.)
 * and local filesystem for git operations.
 * 
 * Pattern: Download repo → Perform git ops → Upload changes → Cleanup
 */

import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { join, relative } from "path";
import { Readable } from "stream";
import { getStorage, type StorageAdapter } from "./storage";

// Cache for warm Vercel functions
const repoCache = new Map<string, { localPath: string; lastUsed: Date; modified: boolean }>();
const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get the temp directory base path
 * Uses /tmp on Vercel, or .tmp in project for local dev
 */
function getTempBase(): string {
    if (process.env.VERCEL) {
        return "/tmp/opencodehub-repos";
    }
    return join(process.cwd(), ".tmp", "repos");
}

/**
 * Check if we're using cloud storage that requires sync
 */
export async function isCloudStorage(): Promise<boolean> {
    const type = process.env.STORAGE_TYPE || "local";
    return ["gdrive", "s3", "gcs", "azure", "rclone", "onedrive"].includes(type);
}

/**
 * Get the storage path for a repository
 * This is the logical path in cloud storage
 */
export function getStorageRepoPath(owner: string, repoName: string): string {
    return `repos/${owner}/${repoName}.git`;
}

/**
 * Get a local temp path for a repository
 */
function getLocalTempPath(owner: string, repoName: string): string {
    const base = getTempBase();
    return join(base, owner, `${repoName}.git`);
}

/**
 * Download a repository from cloud storage to local temp directory
 */
export async function downloadRepoFromStorage(
    storagePath: string,
    localPath: string
): Promise<void> {
    const storage = await getStorage();

    // Ensure local directory exists
    mkdirSync(localPath, { recursive: true });

    // List all files in the storage path
    const result = await storage.list({ prefix: storagePath });

    // Download each file
    for (const obj of result.objects) {
        const relativePath = obj.key.replace(storagePath, "").replace(/^\//, "");
        if (!relativePath) continue;

        const localFilePath = join(localPath, relativePath);
        const localDir = path.dirname(localFilePath);

        if (!existsSync(localDir)) {
            mkdirSync(localDir, { recursive: true });
        }

        try {
            const content = await storage.get(obj.key);
            await fs.writeFile(localFilePath, content);
        } catch (err) {
            console.error(`Failed to download ${obj.key}:`, err);
        }
    }

    // Handle nested prefixes (folders) recursively
    if (result.prefixes) {
        for (const prefix of result.prefixes) {
            const subPath = join(storagePath, prefix);
            const localSubPath = join(localPath, prefix);
            await downloadRepoFromStorage(subPath, localSubPath);
        }
    }
}

/**
 * Upload a repository from local to cloud storage
 */
export async function uploadRepoToStorage(
    localPath: string,
    storagePath: string
): Promise<void> {
    const storage = await getStorage();

    async function uploadDir(dirPath: string): Promise<void> {
        const entries = readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dirPath, entry.name);
            const relativePath = relative(localPath, fullPath);
            const storageKey = join(storagePath, relativePath);

            if (entry.isDirectory()) {
                await uploadDir(fullPath);
            } else {
                const content = await fs.readFile(fullPath);
                await storage.put(storageKey, content);
            }
        }
    }

    await uploadDir(localPath);
}

/**
 * Delete a repository from cloud storage
 */
export async function deleteRepoFromStorage(storagePath: string): Promise<void> {
    const storage = await getStorage();

    // List all files in the repo
    const result = await storage.list({ prefix: storagePath });

    // Delete each file
    for (const obj of result.objects) {
        await storage.delete(obj.key);
    }
}

/**
 * Acquire a local path to a repository for git operations
 * If using cloud storage, downloads the repo to temp first
 * 
 * @returns The local filesystem path to use for git operations
 */
export async function acquireRepo(owner: string, repoName: string): Promise<string> {
    const storagePath = getStorageRepoPath(owner, repoName);
    const cacheKey = storagePath;

    // Check if we're using local storage
    if (!(await isCloudStorage())) {
        // Local storage: return the direct path
        const reposPath = process.env.GIT_REPOS_PATH
            ? (path.isAbsolute(process.env.GIT_REPOS_PATH) ? process.env.GIT_REPOS_PATH : join(process.cwd(), process.env.GIT_REPOS_PATH))
            : join(process.cwd(), "data", "repos");
        return join(reposPath, owner, `${repoName}.git`);
    }

    // Cloud storage: check cache first
    if (repoCache.has(cacheKey)) {
        const cached = repoCache.get(cacheKey)!;
        const age = Date.now() - cached.lastUsed.getTime();

        if (age < CACHE_MAX_AGE_MS && existsSync(cached.localPath)) {
            cached.lastUsed = new Date();
            return cached.localPath;
        }

        // Cache expired, clean up
        if (existsSync(cached.localPath)) {
            rmSync(cached.localPath, { recursive: true, force: true });
        }
        repoCache.delete(cacheKey);
    }

    // Download from storage
    const localPath = getLocalTempPath(owner, repoName);

    // Clean up any existing temp files
    if (existsSync(localPath)) {
        rmSync(localPath, { recursive: true, force: true });
    }

    await downloadRepoFromStorage(storagePath, localPath);

    // Cache the path
    repoCache.set(cacheKey, {
        localPath,
        lastUsed: new Date(),
        modified: false,
    });

    return localPath;
}

/**
 * Release a repository after git operations
 * If modified, syncs changes back to cloud storage
 * 
 * @param localPath - The path returned by acquireRepo
 * @param modified - Whether the repo was modified (needs sync)
 */
export async function releaseRepo(
    owner: string,
    repoName: string,
    modified: boolean = false
): Promise<void> {
    const storagePath = getStorageRepoPath(owner, repoName);
    const cacheKey = storagePath;

    // Local storage: nothing to do
    if (!(await isCloudStorage())) {
        return;
    }

    const cached = repoCache.get(cacheKey);
    if (!cached) {
        return;
    }

    if (modified) {
        cached.modified = true;
        // Sync back to storage
        await uploadRepoToStorage(cached.localPath, storagePath);
    }

    // Don't delete from cache immediately - keep for warm functions
    cached.lastUsed = new Date();
}

/**
 * Initialize a new repository in cloud storage
 * Creates repo locally in temp, then uploads to storage
 * 
 * @returns Local temp path for further git operations
 */
export async function initRepoInStorage(
    owner: string,
    repoName: string
): Promise<string> {
    if (!(await isCloudStorage())) {
        // Local storage: return the direct path
        const reposPath = process.env.GIT_REPOS_PATH
            ? (path.isAbsolute(process.env.GIT_REPOS_PATH) ? process.env.GIT_REPOS_PATH : join(process.cwd(), process.env.GIT_REPOS_PATH))
            : join(process.cwd(), "data", "repos");
        return join(reposPath, owner, `${repoName}.git`);
    }

    // Cloud storage: create in temp
    const localPath = getLocalTempPath(owner, repoName);

    // Clean up any existing
    if (existsSync(localPath)) {
        rmSync(localPath, { recursive: true, force: true });
    }

    // Create directory
    mkdirSync(localPath, { recursive: true });

    return localPath;
}

/**
 * Finalize repository initialization by uploading to storage
 * Call this after git init operations are complete
 */
export async function finalizeRepoInit(owner: string, repoName: string): Promise<void> {
    if (!(await isCloudStorage())) {
        return;
    }

    const localPath = getLocalTempPath(owner, repoName);
    const storagePath = getStorageRepoPath(owner, repoName);

    await uploadRepoToStorage(localPath, storagePath);

    // Cache it
    repoCache.set(storagePath, {
        localPath,
        lastUsed: new Date(),
        modified: false,
    });
}

/**
 * Clean up old cached repos
 * Call this periodically or at the end of request handling
 */
export function cleanupCache(): void {
    const nowTime = Date.now();

    Array.from(repoCache.entries()).forEach(([key, cached]) => {
        const age = nowTime - cached.lastUsed.getTime();

        if (age > CACHE_MAX_AGE_MS) {
            // Expired
            if (existsSync(cached.localPath)) {
                try {
                    rmSync(cached.localPath, { recursive: true, force: true });
                } catch (err) {
                    console.error(`Failed to cleanup cache ${cached.localPath}:`, err);
                }
            }
            repoCache.delete(key);
        }
    });
}

/**
 * Helper to parse owner and repo from a storage path
 */
export function parseStoragePath(storagePath: string): { owner: string; repoName: string } | null {
    const match = storagePath.match(/repos\/([^/]+)\/([^/]+)\.git/);
    if (!match) return null;
    return { owner: match[1], repoName: match[2] };
}

/**
 * Get the disk_path value to store in database
 * Returns logical storage path for cloud, or physical path for local
 */
export async function getDiskPath(owner: string, repoName: string): Promise<string> {
    if (await isCloudStorage()) {
        return getStorageRepoPath(owner, repoName);
    }
    const reposPath = process.env.GIT_REPOS_PATH
        ? (path.isAbsolute(process.env.GIT_REPOS_PATH) ? process.env.GIT_REPOS_PATH : join(process.cwd(), process.env.GIT_REPOS_PATH))
        : join(process.cwd(), "data", "repos");
    return join(reposPath, owner, `${repoName}.git`);
}

/**
 * Resolve a disk_path from database to a usable local path
 * For cloud storage, this triggers download if needed
 */
export async function resolveRepoPath(diskPath: string): Promise<string> {
    if (!(await isCloudStorage())) {
        return diskPath; // Already a local path
    }

    const parsed = parseStoragePath(diskPath);
    if (!parsed) {
        throw new Error(`Invalid storage path: ${diskPath}`);
    }

    return acquireRepo(parsed.owner, parsed.repoName);
}
