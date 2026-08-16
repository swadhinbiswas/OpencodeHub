import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, badRequest, success, serverError, forbidden } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateId } from "@/lib/utils";
import { canAdminOrg, getOrgPermission } from "@/lib/permissions";
import { z } from "zod";

const createOrgSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Organization name must be lowercase alphanumeric with hyphens"),
  displayName: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  location: z.string().max(200).optional(),
});

const updateOrgSchema = createOrgSchema.partial();

// GET: list organizations the current user is a member of
export const GET: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(schema.organizationMembers.userId, user.userId),
    with: { organization: true },
  });

  return success({
    organizations: memberships.map((m) => ({ ...m.organization, memberRole: m.role })),
  });
});

// POST: create an organization (creator becomes owner)
export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const body = await request.json();
  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", parsed.error);

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Name uniqueness (case-insensitive)
  const existing = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, parsed.data.name),
  });
  if (existing) return badRequest("An organization with this name already exists");

  const orgId = generateId("org");
  const now = new Date();
  await db.insert(schema.organizations).values({
    id: orgId,
    name: parsed.data.name,
    displayName: parsed.data.displayName || parsed.data.name,
    description: parsed.data.description,
    email: parsed.data.email,
    website: parsed.data.website,
    location: parsed.data.location,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.organizationMembers).values({
    organizationId: orgId,
    userId: user.userId,
    role: "owner",
    createdAt: now,
  });

  logger.info({ userId: user.userId, orgId }, "Organization created");
  return new Response(
    JSON.stringify({ success: true, data: { organization: { id: orgId, name: parsed.data.name } } }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
});

// PATCH: update organization settings (owner/admin only)
export const PATCH: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org } = params;
  if (!org) return badRequest("Missing organization");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org),
  });
  if (!organization) return badRequest("Organization not found");

  if (!(await canAdminOrg(user.userId, organization.id))) return forbidden();

  const body = await request.json();
  const parsed = updateOrgSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", parsed.error);

  const updates: any = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updates[key] = value;
  }

  await db.update(schema.organizations).set(updates).where(eq(schema.organizations.id, organization.id));

  logger.info({ userId: user.userId, orgId: organization.id }, "Organization updated");
  return success({ message: "Organization updated" });
});

// DELETE: delete an organization (owner only)
export const DELETE: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org } = params;
  if (!org) return badRequest("Missing organization");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org),
  });
  if (!organization) return badRequest("Organization not found");

  const permission = await getOrgPermission(user.userId, organization.id);
  if (permission !== "owner") return forbidden("Only the organization owner can delete it");

  await db.delete(schema.organizations).where(eq(schema.organizations.id, organization.id));

  logger.info({ userId: user.userId, orgId: organization.id }, "Organization deleted");
  return success({ message: "Organization deleted" });
});
