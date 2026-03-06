/**
 * Admin Users API - Update user (ban, promote to admin)
 */
import { getDatabase, schema } from "@/db";
import { users } from "@/db/schema";
import { badRequest, forbidden, notFound, success } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { type APIRoute } from "astro";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export const PATCH: APIRoute = withErrorHandler(
  async ({ params, request, locals }) => {
    const currentUser = locals.user;

    // Only admins can access
    if (!currentUser?.isAdmin) {
      return forbidden("Admin access required");
    }

    const { userId } = params;
    if (!userId) return badRequest("User ID required");

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find user
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!targetUser) return notFound("User not found");

    // Cannot modify yourself
    if (targetUser.id === currentUser.id) {
      return badRequest("Cannot modify your own account");
    }

    // Parse body
    const body = await request.json();
    const { isAdmin, isActive } = body;

    const updates: any = { updatedAt: new Date() };
    if (typeof isAdmin === "boolean") updates.isAdmin = isAdmin;
    if (typeof isActive === "boolean") updates.isActive = isActive;

    await db.update(users).set(updates).where(eq(users.id, userId));

    // Audit log for admin actions
    const { logAudit, getRequestMeta } = await import("@/lib/audit");
    const { ip, userAgent } = getRequestMeta(request);
    if (typeof isAdmin === "boolean") {
      await logAudit({
        userId: currentUser.id,
        action: isAdmin ? "user.promote_admin" : "user.demote_admin",
        actorIp: ip,
        actorUserAgent: userAgent,
        targetType: "user",
        targetId: userId,
        targetName: targetUser.username,
        data: { before: targetUser.isAdmin, after: isAdmin },
      });
    }
    if (typeof isActive === "boolean") {
      await logAudit({
        userId: currentUser.id,
        action: isActive ? "user.activate" : "user.deactivate",
        actorIp: ip,
        actorUserAgent: userAgent,
        targetType: "user",
        targetId: userId,
        targetName: targetUser.username,
        data: { before: targetUser.isActive, after: isActive },
      });
    }

    logger.info(
      {
        adminId: currentUser.id,
        targetUserId: userId,
        updates: { isAdmin, isActive },
      },
      "User updated by admin",
    );

    return success({ message: "User updated" });
  },
);
