import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { canAdminOrg } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, notFound, success, unauthorized, forbidden } from "@/lib/api";

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

    const members = await db.query.organizationMembers.findMany({
        where: eq(schema.organizationMembers.organizationId, organization.id),
        with: {
            user: true,
        },
    });

    return success({ members });
});
