/**
 * Repository Mirror Sync Library
 * Handles background synchronization of mirrored repositories
 */

import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import simpleGit, { SimpleGit } from "simple-git";
import path from "path";

const REPOS_BASE_PATH = process.env.REPOS_PATH || path.join(process.cwd(), "data", "repos");

interface SyncResult {
    success: boolean;
    refsUpdated: number;
    error?: string;
}

/**
 * Sync a single mirrored repository with its upstream
 */
export async function syncMirrorRepository(repoId: string): Promise<SyncResult> {
    const db = getDatabase();

    // Get repository
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repoId),
    });

    if (!repo) {
        return { success: false, refsUpdated: 0, error: "Repository not found" };
    }

    if (!repo.isMirror || !repo.mirrorUrl) {
        return { success: false, refsUpdated: 0, error: "Not a mirror repository" };
    }

    const repoPath = path.join(REPOS_BASE_PATH, repo.diskPath);

    try {
        // Mark as syncing
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.repositories)
            .set({ mirrorSyncStatus: "syncing" })
            .where(eq(schema.repositories.id, repoId));

        const git: SimpleGit = simpleGit(repoPath);

        // Fetch all refs from upstream with prune
        logger.info({ repoId, mirrorUrl: repo.mirrorUrl }, "Starting mirror sync");

        const fetchResult = await git.fetch(["--all", "--prune", "--tags"]);

        // Count updated refs (simplified - fetch doesn't return detailed info easily)
        const refsUpdated = fetchResult.updated?.length || 0;

        // Update sync status
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.repositories)
            .set({
                mirrorSyncStatus: "success",
                lastMirrorSyncAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(schema.repositories.id, repoId));

        logger.info({ repoId, refsUpdated }, "Mirror sync completed");

        return { success: true, refsUpdated };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        logger.error({ repoId, error: errorMessage }, "Mirror sync failed");

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.repositories)
            .set({ mirrorSyncStatus: "failed" })
            .where(eq(schema.repositories.id, repoId));

        return { success: false, refsUpdated: 0, error: errorMessage };
    }
}

/**
 * Sync all mirror repositories
 */
export async function syncAllMirrors(): Promise<{ synced: number; failed: number }> {
    const db = getDatabase();

    const mirrors = await db.query.repositories.findMany({
        where: eq(schema.repositories.isMirror, true),
    });

    let synced = 0;
    let failed = 0;

    for (const mirror of mirrors) {
        const result = await syncMirrorRepository(mirror.id);
        if (result.success) {
            synced++;
        } else {
            failed++;
        }
    }

    logger.info({ synced, failed, total: mirrors.length }, "Mirror sync batch completed");

    return { synced, failed };
}

/**
 * Initialize a new mirror repository
 */
export async function initializeMirror(repoId: string, mirrorUrl: string): Promise<SyncResult> {
    const db = getDatabase();

    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repoId),
    });

    if (!repo) {
        return { success: false, refsUpdated: 0, error: "Repository not found" };
    }

    const repoPath = path.join(REPOS_BASE_PATH, repo.diskPath);

    try {
        const git: SimpleGit = simpleGit(repoPath);

        // Add upstream remote
        await git.addRemote("upstream", mirrorUrl);

        // Mark as mirror in DB
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.repositories)
            .set({
                isMirror: true,
                mirrorUrl: mirrorUrl,
                mirrorSyncStatus: "pending",
            })
            .where(eq(schema.repositories.id, repoId));

        // Perform initial sync
        return await syncMirrorRepository(repoId);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, refsUpdated: 0, error: errorMessage };
    }
}
