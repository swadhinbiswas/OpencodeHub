import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, forbidden, serverError } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canAdminOrg } from "@/lib/permissions";
import { generateId } from "@/lib/utils";
import { z } from "zod";

/**
 * First-party team management (WS3-03).
 * Teams previously existed only via SCIM — this provides CRUD + members.
 */

const createTeamSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  privacy: z.enum(["visible", "secret"]).optional().default("visible"),
  memberIds: z.array(z.string()).optional(),
});

async function getOrg(db: any, org: string) {
  return db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org),
  });
}

// GET: list teams in the org (visible ones for members, all for admins)
export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org } = params;
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await getOrg(db, org!);
  if (!organization) return notFound("Organization not found");

  const isAdmin = await canAdminOrg(user.userId, organization.id);
  const teams = await db.query.teams.findMany({
    where: isAdmin ? eq(schema.teams.organizationId, organization.id) : eq(schema.teams.organizationId, organization.id),
    with: {
      members: { with: { user: true } },
    },
  });

  return success({
    teams: teams
      .filter((t) => isAdmin || t.privacy !== "secret")
      .map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        privacy: t.privacy,
        members: t.members.map((m) => ({
          id: m.user.id,
          username: m.user.username,
          role: m.role,
        })),
      })),
  });
});

// POST: create a team
export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org } = params;
  const body = await request.json();
  const parsed = createTeamSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", parsed.error);

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await getOrg(db, org!);
  if (!organization) return notFound("Organization not found");
  if (!(await canAdminOrg(user.userId, organization.id))) return forbidden();

  // Slug uniqueness within the org
  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const existing = await db.query.teams.findFirst({
    where: and(
      eq(schema.teams.organizationId, organization.id),
      eq(schema.teams.slug, slug),
    ),
  });
  if (existing) return badRequest("A team with this name already exists");

  const id = generateId("team");
  await db.insert(schema.teams).values({
    id,
    organizationId: organization.id,
    name: parsed.data.name,
    slug,
    description: parsed.data.description,
    privacy: parsed.data.privacy,
  });

  if (parsed.data.memberIds?.length) {
    await db.insert(schema.teamMembers).values(
      parsed.data.memberIds.map((userId) => ({
        teamId: id,
        userId,
        role: "member",
        createdAt: new Date(),
      })),
    );
  }

  logger.info({ userId: user.userId, orgId: organization.id, teamId: id }, "Team created");
  return success({ team: { id, name: parsed.data.name, slug } });
});
