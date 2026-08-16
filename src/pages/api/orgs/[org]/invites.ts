import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, forbidden, serverError } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateId } from "@/lib/utils";
import { canAdminOrg } from "@/lib/permissions";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";

const createInviteSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(1).optional(),
  role: z.enum(["member", "admin"]).optional().default("member"),
}).refine((d) => d.email || d.username, {
  message: "email or username required",
});

const INVITE_TTL_DAYS = 7;

function hashInviteToken(token: string): string {
  return createHash("sha256").update(`och-invite:${token}`).digest("hex");
}

// GET: list pending invites (owner/admin)
export const GET: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org } = params;
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org!),
  });
  if (!organization) return notFound("Organization not found");
  if (!(await canAdminOrg(user.userId, organization.id))) return forbidden();

  const invites = await db.query.orgInvites.findMany({
    where: and(
      eq(schema.orgInvites.organizationId, organization.id),
      eq(schema.orgInvites.status, "pending"),
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return success({
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      status: i.status,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })),
  });
});

// POST: create an invite
export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const { org } = params;
  const body = await request.json();
  const parsed = createInviteSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", parsed.error);

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, org!),
  });
  if (!organization) return notFound("Organization not found");
  if (!(await canAdminOrg(user.userId, organization.id))) return forbidden();

  // Resolve target user (by username) or email
  let targetUserId: string | null = null;
  let targetEmail: string | null = null;
  if (parsed.data.username) {
    const target = await db.query.users.findFirst({
      where: eq(schema.users.username, parsed.data.username),
    });
    if (!target) return badRequest("User not found");
    targetUserId = target.id;
    targetEmail = target.email;
    // Already a member?
    const existing = await db.query.organizationMembers.findFirst({
      where: and(
        eq(schema.organizationMembers.organizationId, organization.id),
        eq(schema.organizationMembers.userId, target.id),
      ),
    });
    if (existing) return badRequest("User is already a member");
  } else {
    targetEmail = parsed.data.email!;
  }

  // Duplicate pending invite check
  const dup = await db.query.orgInvites.findFirst({
    where: and(
      eq(schema.orgInvites.organizationId, organization.id),
      eq(schema.orgInvites.email, targetEmail),
      eq(schema.orgInvites.status, "pending"),
    ),
  });
  if (dup) return badRequest("A pending invite already exists for this user");

  const token = randomBytes(24).toString("base64url");
  const id = generateId("invite");
  await db.insert(schema.orgInvites).values({
    id,
    organizationId: organization.id,
    invitedById: user.userId,
    email: targetEmail,
    userId: targetUserId,
    role: parsed.data.role,
    tokenHash: hashInviteToken(token),
    status: "pending",
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
  });

  const siteUrl = process.env.SITE_URL || "http://localhost:4321";
  const acceptUrl = `${siteUrl}/orgs/${organization.name}/invite?token=${token}`;

  // Email the invitee if we have an address
  if (targetEmail && targetEmail !== user.email) {
    import("@/lib/email").then(({ sendEmail }) => {
      sendEmail({
        to: targetEmail!,
        subject: `You've been invited to join ${organization.name}`,
        html: `<p>You've been invited to join the <strong>${organization.displayName || organization.name}</strong> organization on OpenCodeHub.</p>
               <p><a href="${acceptUrl}">Accept the invitation</a></p>
               <p>This invitation expires in ${INVITE_TTL_DAYS} days.</p>`,
      }).catch((err) => logger.error({ err }, "Invite email failed"));
    });
  }

  logger.info({ userId: user.userId, orgId: organization.id, inviteId: id }, "Org invite created");
  return success({ invite: { id, acceptUrl } });
});
