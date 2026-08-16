import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, success, notFound, forbidden } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canAdminOrg } from "@/lib/permissions";

// DELETE: revoke a pending invite
export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org, inviteId } = params;
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org!),
  });
  if (!organization) return notFound("Organization not found");
  if (!(await canAdminOrg(user.userId, organization.id))) return forbidden();

  await db
    .update(schema.orgInvites)
    .set({ status: "revoked" })
    .where(
      and(
        eq(schema.orgInvites.id, inviteId!),
        eq(schema.orgInvites.organizationId, organization.id),
      ),
    );

  return success({ message: "Invite revoked" });
});
