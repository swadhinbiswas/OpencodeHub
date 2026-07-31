/**
 * SCIM 2.0 User by ID API Endpoint
 * GET /api/scim/v2/Users/[id] - Fetch user
 * PUT /api/scim/v2/Users/[id] - Replace user
 * PATCH /api/scim/v2/Users/[id] - Update/Deactivate user
 * DELETE /api/scim/v2/Users/[id] - Delete/De-provision user
 */

import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
    formatSCIMUser,
    scimUpdateUser,
    createSCIMError,
} from "@/lib/scim";
import { logger } from "@/lib/logger";

export const GET: APIRoute = async ({ params, url }) => {
    try {
        const { id } = params;
        if (!id) {
            return new Response(JSON.stringify(createSCIMError(400, "Missing user ID")), {
                status: 400,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        const baseUrl = new URL(url).origin;
        const db = getDatabase();

        const user = await db.query.users.findFirst({
            where: eq(schema.users.id, id),
        });

        if (!user) {
            return new Response(JSON.stringify(createSCIMError(404, "User not found")), {
                status: 404,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        return new Response(JSON.stringify(formatSCIMUser(user, baseUrl)), {
            status: 200,
            headers: { "Content-Type": "application/scim+json" },
        });
    } catch (err: any) {
        logger.error({ err: err.message }, "SCIM GET User by ID error");
        return new Response(JSON.stringify(createSCIMError(500, err.message)), {
            status: 500,
            headers: { "Content-Type": "application/scim+json" },
        });
    }
};

export const PUT: APIRoute = async ({ params, request, url }) => {
    try {
        const { id } = params;
        if (!id) {
            return new Response(JSON.stringify(createSCIMError(400, "Missing user ID")), {
                status: 400,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        const baseUrl = new URL(url).origin;
        const body = await request.json();

        const updated = await scimUpdateUser(id, body, baseUrl);
        if (!updated) {
            return new Response(JSON.stringify(createSCIMError(404, "User not found")), {
                status: 404,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        return new Response(JSON.stringify(updated), {
            status: 200,
            headers: { "Content-Type": "application/scim+json" },
        });
    } catch (err: any) {
        logger.error({ err: err.message }, "SCIM PUT User error");
        return new Response(JSON.stringify(createSCIMError(400, err.message)), {
            status: 400,
            headers: { "Content-Type": "application/scim+json" },
        });
    }
};

export const PATCH: APIRoute = async ({ params, request, url }) => {
    try {
        const { id } = params;
        if (!id) {
            return new Response(JSON.stringify(createSCIMError(400, "Missing user ID")), {
                status: 400,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        const baseUrl = new URL(url).origin;
        const body = await request.json();

        // Handle SCIM Patch Operations (e.g. active = false for deactivation)
        let updates: Record<string, any> = {};
        if (body.Operations && Array.isArray(body.Operations)) {
            for (const op of body.Operations) {
                if (op.value && typeof op.value === "object") {
                    if (op.value.active !== undefined) updates.active = op.value.active;
                }
            }
        }

        const updated = await scimUpdateUser(id, updates, baseUrl);
        if (!updated) {
            return new Response(JSON.stringify(createSCIMError(404, "User not found")), {
                status: 404,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        return new Response(JSON.stringify(updated), {
            status: 200,
            headers: { "Content-Type": "application/scim+json" },
        });
    } catch (err: any) {
        logger.error({ err: err.message }, "SCIM PATCH User error");
        return new Response(JSON.stringify(createSCIMError(400, err.message)), {
            status: 400,
            headers: { "Content-Type": "application/scim+json" },
        });
    }
};

export const DELETE: APIRoute = async ({ params }) => {
    try {
        const { id } = params;
        if (!id) {
            return new Response(JSON.stringify(createSCIMError(400, "Missing user ID")), {
                status: 400,
                headers: { "Content-Type": "application/scim+json" },
            });
        }

        const db = getDatabase();
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.delete(schema.users).where(eq(schema.users.id, id));

        return new Response(null, { status: 24 });
    } catch (err: any) {
        logger.error({ err: err.message }, "SCIM DELETE User error");
        return new Response(JSON.stringify(createSCIMError(500, err.message)), {
            status: 500,
            headers: { "Content-Type": "application/scim+json" },
        });
    }
};
