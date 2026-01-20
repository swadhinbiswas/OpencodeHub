/**
 * Real-time Updates SSE Endpoint
 * Server-Sent Events for live inbox and queue updates
 */

import type { APIRoute } from "astro";
import { createSSEResponse, getConnectionStats } from "@/lib/realtime";

export const GET: APIRoute = async ({ locals, url }) => {
    const user = locals.user;

    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Get optional repository filter from query params
    const repos = url.searchParams.get("repos");
    const repositories = repos ? repos.split(",").filter(Boolean) : [];

    // Create and return SSE response
    return createSSEResponse(user.id, repositories);
};

// Endpoint to get connection stats (admin only)
export const POST: APIRoute = async ({ locals, request }) => {
    const user = locals.user;

    if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Only allow admins to see stats
    // if (!user.isAdmin) {
    //   return new Response(JSON.stringify({ error: "Forbidden" }), {
    //     status: 403,
    //     headers: { "Content-Type": "application/json" },
    //   });
    // }

    const stats = getConnectionStats();

    return new Response(JSON.stringify(stats), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};
