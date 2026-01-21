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
import { initRepository } from "./git";
import { logger } from "./logger";

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
    // Use import.meta.env for Astro compatibility, fallback to process.env for CLI/scripts
    const importMetaEnvType = import.meta.env?.STORAGE_TYPE;
    const processEnvType = process.env.STORAGE_TYPE;
    const type = importMetaEnvType || processEnvType || "local";
    console.log(`[isCloudStorage] import.meta.env.STORAGE_TYPE=${importMetaEnvType}, process.env.STORAGE_TYPE=${processEnvType}, using=${type}`);
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

    // If no objects found, repo might not be initialized yet (lazy init)
    // This is OK - just return with empty directory
    if (!result.objects || result.objects.length === 0) {
        console.log(`[downloadRepoFromStorage] No files found at ${storagePath} - repo may not be initialized yet`);
        return;
    }

    // Download each file
    for (const obj of result.objects) {
        const relativePath = obj.key.replace(storagePath, "").replace(/^\//, "");
        if (!relativePath) continue;

        console.log(`[downloadRepoFromStorage] storagePath="${storagePath}", obj.key="${obj.key}", relativePath="${relativePath}"`);

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
    console.log(`[uploadRepoToStorage] Starting upload from ${localPath} to ${storagePath}`);

    // Check if directory exists
    if (!existsSync(localPath)) {
        console.error(`[uploadRepoToStorage] ERROR: Directory does not exist: ${localPath}`);
        return;
    }

    // Check what's in the directory
    const topLevelEntries = readdirSync(localPath, { withFileTypes: true });
    console.log(`[uploadRepoToStorage] Found ${topLevelEntries.length} top-level entries: ${topLevelEntries.map(e => e.name).join(', ')}`);

    let fileCount = 0;
    async function uploadDir(dirPath: string): Promise<void> {
        let entries;
        try {
            entries = readdirSync(dirPath, { withFileTypes: true });
        } catch (err) {
            console.error(`[uploadRepoToStorage] Failed to read directory ${dirPath}:`, err);
            return;
        }

        for (const entry of entries) {
            const fullPath = join(dirPath, entry.name);
            const relativePath = relative(localPath, fullPath);
            const storageKey = join(storagePath, relativePath);

            if (entry.isDirectory()) {
                await uploadDir(fullPath);
            } else {
                try {
                    const content = await fs.readFile(fullPath);
                    console.log(`[uploadRepoToStorage] Uploading: ${storageKey} (${content.length} bytes)`);
                    await storage.put(storageKey, content);
                    fileCount++;
                } catch (err) {
                    console.error(`[uploadRepoToStorage] Failed to upload ${fullPath}:`, err);
                }
            }
        }
    }

    await uploadDir(localPath);
    console.log(`[uploadRepoToStorage] Completed: ${fileCount} files uploaded`);
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
        const gitReposPath = import.meta.env?.GIT_REPOS_PATH || process.env.GIT_REPOS_PATH;
        const reposPath = gitReposPath
            ? (path.isAbsolute(gitReposPath) ? gitReposPath : join(process.cwd(), gitReposPath))
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

    // Check if local directory already has a valid git repo
    // This handles:
    // 1. Race condition where upload is in progress but page loads
    // 2. Recently created repos where async S3 upload hasn't finished
    const headPath = join(localPath, 'HEAD');
    if (existsSync(localPath) && existsSync(headPath)) {
        console.log(`[acquireRepo] Local repo exists and has HEAD file, using existing: ${localPath}`);
        // Add to cache so subsequent requests use it
        repoCache.set(cacheKey, {
            localPath,
            lastUsed: new Date(),
            modified: false,
        });
        return localPath;
    }

    // Clean up any existing temp files (only if not a valid git repo)
    if (existsSync(localPath)) {
        console.log(`[acquireRepo] Cleaning up incomplete temp directory: ${localPath}`);
        rmSync(localPath, { recursive: true, force: true });
    }

    // Download from S3 (this might fail if async upload is still in progress)
    try {
        await downloadRepoFromStorage(storagePath, localPath);
    } catch (err) {
        console.error(`[acquireRepo] Failed to download from storage:`, err);
        // If download fails, the repo might not be uploaded yet
        // Try to use local git repos path as fallback
        const gitReposPath = import.meta.env?.GIT_REPOS_PATH || process.env.GIT_REPOS_PATH;
        const reposPath = gitReposPath
            ? (path.isAbsolute(gitReposPath) ? gitReposPath : join(process.cwd(), gitReposPath))
            : join(process.cwd(), "data", "repos");
        const fallbackPath = join(reposPath, owner, `${repoName}.git`);

        if (existsSync(fallbackPath) && existsSync(join(fallbackPath, 'HEAD'))) {
            console.log(`[acquireRepo] Using fallback local path: ${fallbackPath}`);
            // For local fallback, copy to temp location
            // Remove target dir if exists, then copy
            if (existsSync(localPath)) {
                rmSync(localPath, { recursive: true, force: true });
            }
            // Create target directory
            mkdirSync(localPath, { recursive: true });
            const { execSync } = await import('child_process');
            // Copy directory CONTENTS (using /. to copy contents, not the directory itself)
            execSync(`cp -R "${fallbackPath}/." "${localPath}/"`, { stdio: 'inherit' });
            console.log(`[acquireRepo] Successfully copied from fallback`);
        } else {
            console.error(`[acquireRepo] No fallback found at: ${fallbackPath}`);
            throw new Error(`Repository not found in S3 and local fallback unavailable. S3 upload may still be in progress - try again in a moment.`);
        }
    }

    // After download, log if repo was initialized
    // headPath already declared at line 225
    console.log(`[acquireRepo] After download - HEAD exists: ${existsSync(headPath)}`);

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
        const gitReposPath = import.meta.env?.GIT_REPOS_PATH || process.env.GIT_REPOS_PATH;
        const reposPath = gitReposPath
            ? (path.isAbsolute(gitReposPath) ? gitReposPath : join(process.cwd(), gitReposPath))
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
    console.log(`[finalizeRepoInit] Called for ${owner}/${repoName}`);
    const isCloud = await isCloudStorage();
    console.log(`[finalizeRepoInit] isCloudStorage=${isCloud}`);

    if (!isCloud) {
        console.log(`[finalizeRepoInit] Skipping - not cloud storage`);
        return;
    }

    const localPath = getLocalTempPath(owner, repoName);
    const storagePath = getStorageRepoPath(owner, repoName);
    console.log(`[finalizeRepoInit] Uploading from ${localPath} to ${storagePath}`);

    await uploadRepoToStorage(localPath, storagePath);

    // Cache it
    repoCache.set(storagePath, {
        localPath,
        lastUsed: new Date(),
        modified: false,
    });
    console.log(`[finalizeRepoInit] Completed`);
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
    const gitReposPath = import.meta.env?.GIT_REPOS_PATH || process.env.GIT_REPOS_PATH;
    const reposPath = gitReposPath
        ? (path.isAbsolute(gitReposPath) ? gitReposPath : join(process.cwd(), gitReposPath))
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

/**
 * Check if a repository has been initialized with Git
 * Checks for the presence of HEAD file in both local and cloud storage
 */
export async function isRepoInitialized(owner: string, repoName: string): Promise<boolean> {
    if (!(await isCloudStorage())) {
        // Local: check if HEAD file exists
        const diskPath = await getDiskPath(owner, repoName);
        return existsSync(join(diskPath, 'HEAD'));
    }

    // Cloud: check if HEAD exists in S3
    const storage = await getStorage();
    const headPath = `${getStorageRepoPath(owner, repoName)}/HEAD`;
    return await storage.exists(headPath);
}

/**
 * Ensure repository is initialized, creating it if needed
 * Thread-safe for concurrent first pushes (checks again after acquiring repo)
 * 
 * @returns Local path to the initialized repository
 */
export async function ensureRepoInitialized(
    owner: string,
    repoName: string,
    options: {
        defaultBranch?: string;
        readme?: boolean;
        gitignoreTemplate?: string;
        licenseType?: string;
        repoName?: string;
        ownerName?: string;
    }
): Promise<string> {
    logger.info({ owner, repoName }, "Ensuring repo is initialized");

    // Quick check if already initialized (avoid download if possible)
    if (await isRepoInitialized(owner, repoName)) {
        logger.info("Repo already initialized, acquiring");
        return await acquireRepo(owner, repoName);
    }

    logger.info("Repo not initialized, initializing now");

    // Initialize locally
    const localPath = await initRepoInStorage(owner, repoName);

    // Double-check in case of concurrent initialization
    const headPath = join(localPath, 'HEAD');
    if (existsSync(headPath)) {
        logger.info("HEAD file exists (concurrent init?), using existing");
        return localPath;
    }

    logger.info({ localPath }, "Running git init");
    await initRepository(localPath, {
        defaultBranch: options.defaultBranch || 'main',
        readme: options.readme ?? false, // Don't add README on lazy init by default
        gitignoreTemplate: options.gitignoreTemplate,
        licenseType: options.licenseType,
        repoName: options.repoName || repoName,
        ownerName: options.ownerName || owner,
    });

    // Upload to cloud if needed
    if (await isCloudStorage()) {
        logger.info("Uploading initialized repo to cloud storage");
        await finalizeRepoInit(owner, repoName);
    }

    logger.info("Repo initialization complete");
    return localPath;
}
