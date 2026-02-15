import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { canAdminOrg } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, noContent, notFound, unauthorized, forbidden, parseBody } from "@/lib/api";

const updateRoleSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    permissions: z.array(z.string()).optional(),
});

export const PATCH: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
    const { org, roleId } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!org || !roleId) return badRequest("Missing parameters");

    const parsed = await parseBody(request, updateRoleSchema);
    if ("error" in parsed) return parsed.error;

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const organization = await db.query.organizations.findFirst({
        where: eq(schema.organizations.name, org),
    });

    if (!organization) return notFound("Organization not found");
    if (!(await canAdminOrg(user.id, organization.id, { isAdmin: user.isAdmin }))) return forbidden();

    const role = await db.query.customRoles.findFirst({
        where: and(
            eq(schema.customRoles.id, roleId),
            eq(schema.customRoles.organizationId, organization.id)
        ),
    });

    if (!role) return notFound("Role not found");

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.permissions !== undefined) updateData.permissions = parsed.data.permissions;

    await db.update(schema.customRoles)
        .set(updateData)
        .where(eq(schema.customRoles.id, role.id));

    return noContent();
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { org, roleId } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!org || !roleId) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const organization = await db.query.organizations.findFirst({
        where: eq(schema.organizations.name, org),
    });

    if (!organization) return notFound("Organization not found");
    if (!(await canAdminOrg(user.id, organization.id, { isAdmin: user.isAdmin }))) return forbidden();

    const role = await db.query.customRoles.findFirst({
        where: and(
            eq(schema.customRoles.id, roleId),
            eq(schema.customRoles.organizationId, organization.id)
        ),
    });

    if (!role) return notFound("Role not found");

    await db.update(schema.organizationMembers)
        .set({ customRoleId: null })
        .where(eq(schema.organizationMembers.customRoleId, role.id));

    await db.delete(schema.customRoles)
        .where(eq(schema.customRoles.id, role.id));

    return noContent();
});
