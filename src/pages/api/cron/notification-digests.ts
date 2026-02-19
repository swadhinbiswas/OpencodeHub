import type { APIRoute } from "astro";
import { runDueDigests } from "@/lib/chat-notifications";
import { logger } from "@/lib/logger";

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(request: Request): boolean {
    if (!CRON_SECRET) return false;
    const authHeader = request.headers.get("Authorization");
    return authHeader === `Bearer ${CRON_SECRET}`;
}

export const POST: APIRoute = async ({ request, url }) => {
    if (!isAuthorized(request)) {
        return new Response("Unauthorized", { status: 401 });
    }

    const dryRun = url.searchParams.get("dryRun") === "true";
    const rawMaxRetries = url.searchParams.get("maxRetries");
    const parsedMaxRetries = rawMaxRetries ? Number.parseInt(rawMaxRetries, 10) : 1;
    const maxRetries = Number.isNaN(parsedMaxRetries) ? 1 : parsedMaxRetries;

    try {
        const result = await runDueDigests({ dryRun, maxRetries });
        logger.info({ dryRun, maxRetries, ...result }, "Notification digest cron completed");

        return new Response(JSON.stringify({
            success: true,
            dryRun,
            maxRetries,
            ...result,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error({ error: message, dryRun, maxRetries }, "Notification digest cron failed");
        return new Response(JSON.stringify({
            success: false,
            error: message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

export const GET = POST;
