import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, forbidden } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canAdminOrg } from "@/lib/permissions";
import { z } from "zod";

/**
 * Single-team management: update, delete, add/remove members.
 */

const updateTeamSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(300).nullable().optional(),
  privacy: z.enum(["visible", "secret"]).optional(),
});

const membersSchema = z.object({
  userIds: z.array(z.string()),
});

export const PATCH: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org, teamId } = params;
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org!),
  });
  if (!organization) return notFound("Organization not found");
  if (!(await canAdminOrg(user.userId, organization.id))) return forbidden();

  const team = await db.query.teams.findFirst({
    where: and(
      eq(schema.teams.id, teamId!),
      eq(schema.teams.organizationId, organization.id),
    ),
  });
  if (!team) return notFound("Team not found");

  const body = await request.json();
  const parsed = updateTeamSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", parsed.error);

  const updates: any = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.privacy !== undefined) updates.privacy = parsed.data.privacy;

  await db.update(schema.teams).set(updates).where(eq(schema.teams.id, team.id));
  return success({ message: "Team updated" });
});

export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org, teamId } = params;
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org!),
  });
  if (!organization) return notFound("Organization not found");
  if (!(await canAdminOrg(user.userId, organization.id))) return forbidden();

  await db.delete(schema.teams).where(and(eq(schema.teams.id, teamId!), eq(schema.teams.organizationId, organization.id)));
  logger.info({ userId: user.userId, orgId: organization.id, teamId }, "Team deleted");
  return success({ message: "Team deleted" });
});

