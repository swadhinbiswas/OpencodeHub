import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, forbidden } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canAdminOrg } from "@/lib/permissions";
import { z } from "zod";

const membersSchema = z.object({ userIds: z.array(z.string()) });

async function adminGate(db: NodePgDatabase<typeof schema>, org: string, userId: string) {
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org),
  });
  if (!organization) return null;
  if (!(await canAdminOrg(userId, organization.id))) return false;
  return organization;
}

// POST: add members to the team
export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org, teamId } = params;
  const body = await request.json();
  const parsed = membersSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", parsed.error);

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const gate = await adminGate(db, org!, user.userId);
  if (gate === null) return notFound("Organization not found");
  if (gate === false) return forbidden();

  const team = await db.query.teams.findFirst({
    where: and(
      eq(schema.teams.id, teamId!),
      eq(schema.teams.organizationId, gate.id),
    ),
  });
  if (!team) return notFound("Team not found");

  const existing = await db.query.teamMembers.findMany({
    where: and(
      eq(schema.teamMembers.teamId, team.id),
      inArray(schema.teamMembers.userId, parsed.data.userIds),
    ),
    columns: { userId: true },
  });
  const existingIds = new Set(existing.map((m) => m.userId));
  const toAdd = parsed.data.userIds.filter((id) => !existingIds.has(id));

  if (toAdd.length > 0) {
    await db.insert(schema.teamMembers).values(
      toAdd.map((userId) => ({
        teamId: team.id,
        userId,
        role: "member",
        createdAt: new Date(),
      })),
    );
  }

  return success({ added: toAdd });
});

// DELETE: remove members from the team { userIds: string[] }
export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org, teamId } = params;
  const body = await request.json().catch(() => null);
  const userIds = body?.userIds;
  if (!Array.isArray(userIds)) return badRequest("userIds must be an array");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const gate = await adminGate(db, org!, user.userId);
  if (gate === null) return notFound("Organization not found");
  if (gate === false) return forbidden();

  await db
    .delete(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId!), inArray(schema.teamMembers.userId, userIds)));

  return success({ removed: userIds });
});