/**
 * SCIM 2.0 Groups API Endpoint
 * GET /api/scim/v2/Groups - Search/List teams/groups
 * POST /api/scim/v2/Groups - Create group/team
 */

import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
    formatSCIMGroup,
    createSCIMError,
    SCIM_SCHEMAS,
    type SCIMListResponse,
} from "@/lib/scim";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils";

export const GET: APIRoute = async ({ request, url }) => {
    try {
        const baseUrl = new URL(url).origin;
        const countParam = parseInt(url.searchParams.get("count") || "100", 10);
        const startIndex = parseInt(url.searchParams.get("startIndex") || "1", 10);

        const db = getDatabase();

        const allTeams = await db.query.teams.findMany({
            limit: countParam,
            with: {
                members: true,
            },
        });

        const resources = allTeams.map((team) =>
            formatSCIMGroup(team, team.members || [], baseUrl)
        );

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
        logger.error({ err: err.message }, "SCIM GET Groups error");
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

        if (!body.displayName) {
            return new Response(JSON.stringify(createSCIMError(400, "displayName is required")), {
                status: 400,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        const db = getDatabase();

        // Get default org or create ID
        const org = await db.query.organizations.findFirst();
        if (!org) {
            return new Response(JSON.stringify(createSCIMError(400, "No organization exists for group creation")), {
                status: 400,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        const teamId = generateId();
        const slug = body.displayName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.teams).values({
            id: teamId,
            organizationId: org.id,
            name: body.displayName,
            slug,
            description: "Provisioned via SCIM 2.0",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Add members if provided
        if (body.members && Array.isArray(body.members)) {
            for (const member of body.members) {
                if (member.value) {
                    try {
                        // @ts-expect-error - Drizzle multi-db union type issue
                        await db.insert(schema.teamMembers).values({
                            teamId,
                            userId: member.value,
                            role: "member",
                            createdAt: new Date(),
                        });
                    } catch (e) {
                        // Ignore duplicate member insertions
                    }
                }
            }
        }

        const newTeam = await db.query.teams.findFirst({
            where: eq(schema.teams.id, teamId),
            with: { members: true },
        });

        return new Response(JSON.stringify(formatSCIMGroup(newTeam, newTeam?.members || [], baseUrl)), {
            status: 201,
            headers: {
                "Content-Type": "application/scim+json",
            },
        });
    } catch (err: any) {
        logger.error({ err: err.message }, "SCIM POST Groups error");
        return new Response(JSON.stringify(createSCIMError(400, err.message)), {
            status: 400,
            headers: { "Content-Type": "application/scim+json" },
        });
    }
};
