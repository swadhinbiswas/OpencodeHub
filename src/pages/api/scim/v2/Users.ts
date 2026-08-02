/**
 * SCIM 2.0 Users API Endpoint
 * GET /api/scim/v2/Users - Search/List users
 * POST /api/scim/v2/Users - Create/Provision user
 */

import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, like, count } from "drizzle-orm";
import {
    formatSCIMUser,
    scimCreateUser,
    createSCIMError,
    SCIM_SCHEMAS,
    type SCIMListResponse,
} from "@/lib/scim";
import { logger } from "@/lib/logger";

export const GET: APIRoute = async ({ request, url }) => {
    try {
        const baseUrl = new URL(url).origin;
        const startIndex = parseInt(url.searchParams.get("startIndex") || "1", 10);
        const countParam = parseInt(url.searchParams.get("count") || "100", 10);
        const filter = url.searchParams.get("filter");

        const db = getDatabase();

        // Search users
        let users: any[] = [];
        if (filter && filter.includes("eq")) {
            // Basic eq filter parsing e.g. userName eq "john" or email eq "john@example.com"
            const match = filter.match(/(userName|email)\s+eq\s+["']?([^"']+)["']?/i);
            if (match) {
                const [, field, value] = match;
                if (field.toLowerCase() === "username") {
                    users = await db.query.users.findMany({
                        where: eq(schema.users.username, value),
                        limit: countParam,
                    });
                } else {
                    users = await db.query.users.findMany({
                        where: eq(schema.users.email, value),
                        limit: countParam,
                    });
                }
            } else {
                users = await db.query.users.findMany({ limit: countParam });
            }
        } else {
            users = await db.query.users.findMany({ limit: countParam });
        }

        const resources = users.map((u) => formatSCIMUser(u, baseUrl));

        const response: SCIMListResponse<any> = {
            schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
            totalResults: resources.length,
            startIndex,
            itemsPerPage: countParam,
            Resources: resources,
        };

        return new Response(JSON.stringify(response), {
            status: 200,
            headers: {
                "Content-Type": "application/scim+json",
            },
        });
    } catch (err: any) {
        logger.error({ err: err.message }, "SCIM GET Users error");
        return new Response(JSON.stringify(createSCIMError(500, err.message)), {
            status: 500,
            headers: { "Content-Type": "application/scim+json" },
        });
    }
};

export const POST: APIRoute = async ({ request, url }) => {
    try {
        const baseUrl = new URL(url).origin;
        const body = await request.json();

        const userResource = await scimCreateUser(body, baseUrl);

        return new Response(JSON.stringify(userResource), {
            status: 201,
            headers: {
                "Content-Type": "application/scim+json",
            },
        });
    } catch (err: any) {
        logger.error({ err: err.message }, "SCIM POST Users error");
        return new Response(JSON.stringify(createSCIMError(400, err.message)), {
            status: 400,
            headers: { "Content-Type": "application/scim+json" },
        });
    }
};
