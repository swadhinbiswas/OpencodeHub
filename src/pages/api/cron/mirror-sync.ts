/**
 * Cron endpoint for mirror synchronization
 * Call this endpoint periodically (e.g., every 15 minutes via Vercel Cron)
 */

import type { APIRoute } from "astro";
import { syncAllMirrors } from "@/lib/mirror-sync";
import { logger } from "@/lib/logger";

// Secret for cron authentication (prevents unauthorized triggers)
const CRON_SECRET = process.env.CRON_SECRET;

export const POST: APIRoute = async ({ request }) => {
    // Verify cron secret
    const authHeader = request.headers.get("Authorization");
    const providedSecret = authHeader?.replace("Bearer ", "");

    if (CRON_SECRET && providedSecret !== CRON_SECRET) {
        return new Response("Unauthorized", { status: 401 });
    }

    try {
        logger.info("Starting scheduled mirror sync");

        const result = await syncAllMirrors();

        return new Response(JSON.stringify({
            success: true,
            synced: result.synced,
            failed: result.failed,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error({ error: message }, "Mirror sync cron failed");

        return new Response(JSON.stringify({
            success: false,
            error: message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

// Also support GET for simpler cron services
export const GET = POST;
