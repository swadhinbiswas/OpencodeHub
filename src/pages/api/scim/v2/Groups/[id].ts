/**
 * SCIM 2.0 Group by ID API Endpoint
 * GET /api/scim/v2/Groups/[id] - Fetch group
 * PUT /api/scim/v2/Groups/[id] - Replace group
 * PATCH /api/scim/v2/Groups/[id] - Sync members
 * DELETE /api/scim/v2/Groups/[id] - Delete group
 */

import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
    formatSCIMGroup,
    createSCIMError,
} from "@/lib/scim";
import { logger } from "@/lib/logger";

export const GET: APIRoute = async ({ params, url }) => {
    try {
        const { id } = params;
        if (!id) {
            return new Response(JSON.stringify(createSCIMError(400, "Missing group ID")), {
                status: 400,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        const baseUrl = new URL(url).origin;
        const db = getDatabase();

        const team = await db.query.teams.findFirst({
            where: eq(schema.teams.id, id),
            with: { members: true },
        });

        if (!team) {
            return new Response(JSON.stringify(createSCIMError(404, "Group not found")), {
                status: 404,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        return new Response(JSON.stringify(formatSCIMGroup(team, team.members || [], baseUrl)), {
            status: 200,
            headers: { "Content-Type": "application/scim+json" },
        });
    } catch (err: any) {
        logger.error({ err: err.message }, "SCIM GET Group by ID error");
        return new Response(JSON.stringify(createSCIMError(500, err.message)), {
            status: 500,
            headers: { "Content-Type": "application/scim+json" },
        });
    }
};

export const DELETE: APIRoute = async ({ params }) => {
    try {
        const { id } = params;
        if (!id) {
            return new Response(JSON.stringify(createSCIMError(400, "Missing group ID")), {
                status: 400,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        const db = getDatabase();
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.delete(schema.teams).where(eq(schema.teams.id, id));

        return new Response(null, { status: 204 });
    } catch (err: any) {
        logger.error({ err: err.message }, "SCIM DELETE Group error");
        return new Response(JSON.stringify(createSCIMError(500, err.message)), {
            status: 500,
            headers: { "Content-Type": "application/scim+json" },
        });
    }
};
