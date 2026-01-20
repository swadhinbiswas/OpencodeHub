/**
 * Admin Users API - Update user (ban, promote to admin)
 */
import { type APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from "@/db";
import { users } from '@/db/schema';
import { success, badRequest, notFound, serverError, forbidden } from '@/lib/api';
import { now } from '@/lib/utils';
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const PATCH: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const currentUser = locals.user;

    // Only admins can access
    if (!currentUser?.isAdmin) {
        return forbidden('Admin access required');
    }

    const { userId } = params;
    if (!userId) return badRequest('User ID required');

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find user
    const targetUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
    });
    if (!targetUser) return notFound('User not found');

    // Cannot modify yourself
    if (targetUser.id === currentUser.id) {
        return badRequest('Cannot modify your own account');
    }

    // Parse body
    const body = await request.json();
    const { isAdmin, isActive } = body;

    const updates: any = { updatedAt: new Date() };
    if (typeof isAdmin === 'boolean') updates.isAdmin = isAdmin;
    if (typeof isActive === 'boolean') updates.isActive = isActive;

    await db.update(users)
        .set(updates)
        .where(eq(users.id, userId));

    logger.info({ adminId: currentUser.id, targetUserId: userId, updates: { isAdmin, isActive } }, "User updated by admin");

    return success({ message: 'User updated' });
});
