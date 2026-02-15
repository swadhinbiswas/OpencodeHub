import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { canAdminOrg } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, noContent, notFound, unauthorized, forbidden, parseBody } from "@/lib/api";

const updateMemberSchema = z.object({
    role: z.enum(["owner", "admin", "member"]).optional(),
    customRoleId: z.string().nullable().optional(),
});

export const PATCH: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
    const { org, userId } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!org || !userId) return badRequest("Missing parameters");

    const parsed = await parseBody(request, updateMemberSchema);
    if ("error" in parsed) return parsed.error;

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const organization = await db.query.organizations.findFirst({
        where: eq(schema.organizations.name, org),
    });

    if (!organization) return notFound("Organization not found");
    if (!(await canAdminOrg(user.id, organization.id, { isAdmin: user.isAdmin }))) return forbidden();

    const member = await db.query.organizationMembers.findFirst({
        where: and(
            eq(schema.organizationMembers.organizationId, organization.id),
            eq(schema.organizationMembers.userId, userId)
        ),
    });

    if (!member) return notFound("Member not found");

    if (parsed.data.customRoleId) {
        const role = await db.query.customRoles.findFirst({
            where: and(
                eq(schema.customRoles.id, parsed.data.customRoleId),
                eq(schema.customRoles.organizationId, organization.id)
            ),
        });

        if (!role) return badRequest("Custom role not found");
    }

    const updateData: Record<string, any> = {};
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
    if (parsed.data.customRoleId !== undefined) updateData.customRoleId = parsed.data.customRoleId;

    await db.update(schema.organizationMembers)
        .set(updateData)
        .where(and(
            eq(schema.organizationMembers.organizationId, organization.id),
            eq(schema.organizationMembers.userId, userId)
        ));

    return noContent();
});
