
import { getDatabase, schema } from "@/db";
import { queueWorker } from "@/lib/queue-worker";
import { syncAllMirrors } from "@/lib/mirror-sync";
import { cleanupAllRepos } from "@/lib/cron/cleanup-branches";
import { logger } from "@/lib/logger";
import { eq, and, sql } from "drizzle-orm";

const WORKER_INTERVAL = 5000; // 5 seconds for queue polling
const MIRROR_SYNC_INTERVAL = 60 * 1000; // 1 minute
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

async function runQueueProcessor() {
    const db = getDatabase();

    try {
        // Find repositories with queued items
        // We group by repositoryId to process per-repo queues
        // Actually QueueWorker handles locking per repo?
        // Let's just find distinct repositoryIds that have queued items.
        // Drizzle distinct on unsupported? Let's Fetch all pending items and get unique repoIds.

        const pendingItems = await db.query.mergeQueueItems.findMany({
            where: eq(schema.mergeQueueItems.status, "queued"),
            columns: { repositoryId: true },
            // limit: 100 ??
        });

        const repoIds = [...new Set(pendingItems.map(item => item.repositoryId))];

        if (repoIds.length > 0) {
            logger.info({ repoCount: repoIds.length }, "Processing merge queues");

            // Process concurrently? Or sequentially to avoid load?
            // Concurrently is fine as they are independent locks.
            await Promise.all(repoIds.map(repoId => queueWorker.processQueue(repoId)));
        }

    } catch (error) {
        logger.error({ err: error }, "Error in queue processor loop");
    }
}

async function startWorker() {
    logger.info("Starting OpenCodeHub Background Worker...");

    // 1. Merge Queue Loop
    setInterval(runQueueProcessor, WORKER_INTERVAL);
    // Initial run
    runQueueProcessor();

    // 2. Mirror Sync Loop
    setInterval(async () => {
        try {
            await syncAllMirrors();
        } catch (e) {
            logger.error({ err: e }, "Mirror sync failed");
        }
    }, MIRROR_SYNC_INTERVAL);

    // 3. Cleanup Loop
    setInterval(async () => {
        try {
            await cleanupAllRepos();
        } catch (e) {
            logger.error({ err: e }, "Cleanup failed");
        }
    }, CLEANUP_INTERVAL);

    // Keep process alive
    process.on('SIGINT', () => {
        logger.info("Worker shutting down...");
        process.exit(0);
    });
}

startWorker().catch(console.error);
