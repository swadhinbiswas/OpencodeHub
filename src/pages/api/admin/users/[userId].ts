/**
 * Admin Users API - Update user (ban, promote to admin)
 */
import { type APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { users } from '@/db/schema';
import { success, badRequest, unauthorized, notFound, serverError, forbidden } from '@/lib/api';
import { now } from '@/lib/utils';

export const PATCH: APIRoute = async ({ params, request, locals }) => {
    try {
        const currentUser = locals.user;

        // Only admins can access
        if (!currentUser?.isAdmin) {
            return forbidden('Admin access required');
        }

        const { userId } = params;
        if (!userId) return badRequest('User ID required');

        const db = getDatabase();

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

        const updates: any = { updatedAt: now() };
        if (typeof isAdmin === 'boolean') updates.isAdmin = isAdmin;
        if (typeof isActive === 'boolean') updates.isActive = isActive;

        await db.update(users)
            .set(updates)
            .where(eq(users.id, userId));

        return success({ message: 'User updated' });
    } catch (e) {
        console.error('Error updating user:', e);
        return serverError('Failed to update user');
    }
};
