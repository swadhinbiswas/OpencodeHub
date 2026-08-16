import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createHash } from "crypto";

/**
 * POST /api/orgs/accept-invite  { token }
 * Accepts an org invite for the authenticated user.
 */
export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (!token) return badRequest("Missing invite token");

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const tokenHash = createHash("sha256").update(`och-invite:${token}`).digest("hex");

  const invite = await db.query.orgInvites.findFirst({
    where: eq(schema.orgInvites.tokenHash, tokenHash),
  });
  if (!invite) return notFound("Invitation not found");
  if (invite.status !== "pending") return badRequest("Invitation is no longer pending");
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return badRequest("Invitation has expired");
  }
  // The invite must be addressed to this user (by userId or email)
  if (invite.userId && invite.userId !== user.userId) {
    return badRequest("This invitation was addressed to another user");
  }
  if (!invite.userId && invite.email) {
    const invitee = await db.query.users.findFirst({
      where: eq(schema.users.email, invite.email),
    });
    if (!invitee || invitee.id !== user.userId) {
      return badRequest("This invitation was addressed to a different email");
    }
  }

  // Check not already a member
  const existing = await db.query.organizationMembers.findFirst({
    where: and(
      eq(schema.organizationMembers.organizationId, invite.organizationId),
      eq(schema.organizationMembers.userId, user.userId),
    ),
  });
  if (!existing) {
    await db.insert(schema.organizationMembers).values({
      organizationId: invite.organizationId,
      userId: user.userId,
      role: invite.role || "member",
      createdAt: new Date(),
    });
  }

  // Mark invite accepted
  await db
    .update(schema.orgInvites)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(schema.orgInvites.id, invite.id));

  logger.info({ userId: user.userId, orgId: invite.organizationId, inviteId: invite.id }, "Org invite accepted");
  return success({ message: "Invitation accepted", organizationId: invite.organizationId });
});
