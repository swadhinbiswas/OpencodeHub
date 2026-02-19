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

export interface SyncAllMirrorsOptions {
    staleOnly?: boolean;
    minSyncIntervalMinutes?: number;
    maxRepos?: number;
    staleAfterMinutes?: number;
}

export interface SyncAllMirrorsResult {
    synced: number;
    failed: number;
    total: number;
    eligible: number;
    skipped: number;
    stale: number;
    failedRepoIds: string[];
    durationMs: number;
}

async function ensureUpstreamRemote(git: SimpleGit, mirrorUrl: string): Promise<void> {
    const remotes = await git.getRemotes(true);
    const upstream = remotes.find((remote) => remote.name === "upstream");
    if (!upstream) {
        await git.addRemote("upstream", mirrorUrl);
        return;
    }

    const fetchUrl = upstream.refs.fetch;
    if (fetchUrl !== mirrorUrl) {
        await git.remote(["set-url", "upstream", mirrorUrl]);
    }
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
        await ensureUpstreamRemote(git, repo.mirrorUrl);

        // Mirror upstream refs directly into local heads/tags.
        logger.info({ repoId, mirrorUrl: repo.mirrorUrl }, "Starting mirror sync");

        const fetchResult = await git.raw([
            "fetch",
            "upstream",
            "+refs/heads/*:refs/heads/*",
            "+refs/tags/*:refs/tags/*",
            "--prune",
        ]);

        // Approximate updated refs from fetch output lines.
        const refsUpdated = fetchResult
            .split("\n")
            .filter((line) => line.includes("->"))
            .length;

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
    return syncAllMirrorsWithOptions(mirrors, {});
}

async function syncAllMirrorsWithOptions(
    mirrors: Array<typeof schema.repositories.$inferSelect>,
    options: SyncAllMirrorsOptions
): Promise<SyncAllMirrorsResult> {
    const startedAt = Date.now();
    const staleAfterMinutes = options.staleAfterMinutes ?? 24 * 60;
    const minSyncIntervalMinutes = Math.max(0, options.minSyncIntervalMinutes ?? 30);
    const staleOnly = options.staleOnly ?? true;
    const maxRepos = options.maxRepos && options.maxRepos > 0 ? options.maxRepos : mirrors.length;

    let synced = 0;
    let failed = 0;
    let skipped = 0;
    let stale = 0;
    const failedRepoIds: string[] = [];

    const nowMs = Date.now();
    const eligibleMirrors = mirrors.filter((mirror) => {
        const lastSyncMs = mirror.lastMirrorSyncAt?.getTime() ?? null;
        const ageMinutes = lastSyncMs === null ? null : Math.max(0, Math.floor((nowMs - lastSyncMs) / 60000));
        const isStale = ageMinutes === null ? true : ageMinutes > staleAfterMinutes;
        if (isStale) stale += 1;

        if (mirror.mirrorSyncStatus === "syncing") {
            skipped += 1;
            return false;
        }
        if (staleOnly && !isStale) {
            skipped += 1;
            return false;
        }
        if (!isStale && ageMinutes !== null && ageMinutes < minSyncIntervalMinutes) {
            skipped += 1;
            return false;
        }
        return true;
    }).slice(0, maxRepos);

    for (const mirror of eligibleMirrors) {
        const result = await syncMirrorRepository(mirror.id);
        if (result.success) {
            synced++;
        } else {
            failed++;
            failedRepoIds.push(mirror.id);
        }
    }

    const durationMs = Date.now() - startedAt;
    logger.info(
        {
            synced,
            failed,
            total: mirrors.length,
            eligible: eligibleMirrors.length,
            skipped,
            stale,
            durationMs,
        },
        "Mirror sync batch completed"
    );

    return {
        synced,
        failed,
        total: mirrors.length,
        eligible: eligibleMirrors.length,
        skipped,
        stale,
        failedRepoIds,
        durationMs,
    };
}

export async function syncAllMirrorsScheduled(
    options: SyncAllMirrorsOptions = {}
): Promise<SyncAllMirrorsResult> {
    const db = getDatabase();
    const mirrors = await db.query.repositories.findMany({
        where: eq(schema.repositories.isMirror, true),
    });
    return syncAllMirrorsWithOptions(mirrors, options);
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

        await ensureUpstreamRemote(git, mirrorUrl);

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

export async function disableMirror(repoId: string): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase();
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repoId),
    });
    if (!repo) return { success: false, error: "Repository not found" };

    const repoPath = path.join(REPOS_BASE_PATH, repo.diskPath);
    try {
        const git: SimpleGit = simpleGit(repoPath);
        const remotes = await git.getRemotes(true);
        if (remotes.some((remote) => remote.name === "upstream")) {
            await git.removeRemote("upstream");
        }

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.repositories)
            .set({
                isMirror: false,
                mirrorUrl: null,
                mirrorSyncStatus: null,
                updatedAt: new Date(),
            })
            .where(eq(schema.repositories.id, repoId));

        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error({ repoId, error: errorMessage }, "Failed to disable mirror");
        return { success: false, error: errorMessage };
    }
}
