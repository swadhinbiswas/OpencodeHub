/**
 * OCI Container Registry (Docker v2 API) Ping Endpoint
 * GET /api/v2/
 */

import type { APIRoute } from "astro";
import { handleDockerV2Ping } from "@/lib/packages-server";

export const GET: APIRoute = async () => {
    const res = handleDockerV2Ping();
    return new Response(res.body, {
        status: res.status,
        headers: res.headers,
    });
};
