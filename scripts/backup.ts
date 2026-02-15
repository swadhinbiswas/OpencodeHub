
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

// Get root directory
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const backupDir = join(rootDir, "backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const targetDir = join(backupDir, `backup-${timestamp}`);

// Ensure backup directory exists
if (!existsSync(backupDir)) {
    mkdirSync(backupDir);
}
mkdirSync(targetDir);

console.log(`[Backup] Starting backup to ${targetDir}`);

// 1. Backup Database
const dbDriver = process.env.DATABASE_DRIVER || "sqlite";
const dbUrl = process.env.DATABASE_URL || "data/opencodehub.db";

console.log(`[Backup] Backing up database (${dbDriver})...`);

try {
    if (dbDriver === "sqlite") {
        const dbPath = join(rootDir, dbUrl);
        if (existsSync(dbPath)) {
            copyFileSync(dbPath, join(targetDir, "database.sqlite"));
            console.log(`[Backup] SQLite database copied.`);
        } else {
            console.warn(`[Backup] SQLite database not found at ${dbPath}`);
        }
    } else if (dbDriver === "postgres") {
        // Requires pg_dump to be installed
        const outputFile = join(targetDir, "dump.sql");
        execSync(`pg_dump "${dbUrl}" > "${outputFile}"`);
        console.log(`[Backup] Postgres dumped to dump.sql`);
    } else {
        console.log(`[Backup] Automatic backup not supported for driver: ${dbDriver}. Please check functionality manually.`);
    }
} catch (error) {
    console.error(`[Backup] Database backup failed:`, error);
}

// 2. Backup Repositories
// Assumes repos are in "repos" or "git-data" directory relative to root, or specified by config.
// Default configuration often puts them in ./repos or similar.
// We'll try to find the standard location or read from config if possible.
// For now, we assume "./repos" or check environment GIT_STORAGE_PATH

const repoPath = process.env.GIT_STORAGE_PATH ? join(rootDir, process.env.GIT_STORAGE_PATH) : join(rootDir, "repos");

if (existsSync(repoPath)) {
    console.log(`[Backup] Backing up repositories from ${repoPath}...`);
    const repoArchive = join(targetDir, "repos.tar.gz");
    try {
        execSync(`tar -czf "${repoArchive}" -C "${dirname(repoPath)}" "${process.env.GIT_STORAGE_PATH || "repos"}"`);
        console.log(`[Backup] Repositories archived.`);
    } catch (error) {
        console.error(`[Backup] Repository backup failed:`, error);
    }
} else {
    console.warn(`[Backup] Repository directory not found at ${repoPath}`);
}

// 3. Backup Config / Env
const envPath = join(rootDir, ".env");
if (existsSync(envPath)) {
    copyFileSync(envPath, join(targetDir, ".env.backup"));
    console.log(`[Backup] Environment file copied.`);
}

console.log(`[Backup] Completed successfully at ${targetDir}`);
