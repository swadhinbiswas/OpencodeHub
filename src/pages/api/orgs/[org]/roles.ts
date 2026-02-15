import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { canAdminOrg } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, created, notFound, success, unauthorized, forbidden, parseBody } from "@/lib/api";
import { generateId } from "@/lib/utils";

const createRoleSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    permissions: z.array(z.string()).default([]),
});

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { org } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!org) return badRequest("Missing org");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const organization = await db.query.organizations.findFirst({
        where: eq(schema.organizations.name, org),
    });

    if (!organization) return notFound("Organization not found");
    if (!(await canAdminOrg(user.id, organization.id, { isAdmin: user.isAdmin }))) return forbidden();

    const roles = await db.query.customRoles.findMany({
        where: eq(schema.customRoles.organizationId, organization.id),
        orderBy: [desc(schema.customRoles.createdAt)],
    });

    return success({ roles });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
    const { org } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!org) return badRequest("Missing org");

    const parsed = await parseBody(request, createRoleSchema);
    if ("error" in parsed) return parsed.error;

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const organization = await db.query.organizations.findFirst({
        where: eq(schema.organizations.name, org),
    });

    if (!organization) return notFound("Organization not found");
    if (!(await canAdminOrg(user.id, organization.id, { isAdmin: user.isAdmin }))) return forbidden();

    const role = {
        id: generateId(),
        organizationId: organization.id,
        name: parsed.data.name,
        description: parsed.data.description || null,
        permissions: parsed.data.permissions,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.insert(schema.customRoles).values(role);

    return created({ role });
});
