/**
 * Cron endpoint for mirror synchronization
 * Call this endpoint periodically (e.g., every 15 minutes via Vercel Cron)
 */

import type { APIRoute } from "astro";
import { syncAllMirrorsScheduled } from "@/lib/mirror-sync";
import { logger } from "@/lib/logger";

// Secret for cron authentication (prevents unauthorized triggers)
const CRON_SECRET = process.env.CRON_SECRET;

function parseBooleanParam(value: string | null, defaultValue: boolean): boolean {
    if (value === null) return defaultValue;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return defaultValue;
}

function parseNonNegativeIntParam(value: string | null): number | undefined {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return undefined;
    return parsed;
}

function parsePositiveIntParam(value: string | null): number | undefined {
    const parsed = parseNonNegativeIntParam(value);
    if (parsed === undefined || parsed === 0) return undefined;
    return parsed;
}

export const POST: APIRoute = async ({ request }) => {
    // Verify cron secret
    const authHeader = request.headers.get("Authorization");
    const providedSecret = authHeader?.replace("Bearer ", "");

    if (CRON_SECRET && providedSecret !== CRON_SECRET) {
        return new Response("Unauthorized", { status: 401 });
    }

    try {
        logger.info("Starting scheduled mirror sync");

        const url = new URL(request.url);
        const staleOnlyParam = url.searchParams.get("staleOnly");
        const minSyncIntervalParam = url.searchParams.get("minSyncIntervalMinutes");
        const maxReposParam = url.searchParams.get("maxRepos");
        const staleAfterParam = url.searchParams.get("staleAfterMinutes");

        const staleOnly = parseBooleanParam(staleOnlyParam, true);
        const minSyncIntervalMinutes = parseNonNegativeIntParam(minSyncIntervalParam);
        const maxRepos = parsePositiveIntParam(maxReposParam);
        const staleAfterMinutes = parseNonNegativeIntParam(staleAfterParam);

        const result = await syncAllMirrorsScheduled({
            staleOnly,
            minSyncIntervalMinutes,
            maxRepos,
            staleAfterMinutes,
        });

        return new Response(JSON.stringify({
            success: true,
            ...result,
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
