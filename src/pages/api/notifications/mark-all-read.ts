/**
 * Mark all notifications as read
 */
import { type APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { notifications } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { unauthorized, serverError } from '@/lib/api';

export const POST: APIRoute = async ({ request, redirect }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const db = getDatabase();
        const timestamp = new Date().toISOString();

        await db
            .update(notifications)
            .set({
                isRead: true,
                readAt: timestamp,
                updatedAt: timestamp
            })
            .where(
                and(
                    eq(notifications.userId, tokenPayload.userId),
                    eq(notifications.isRead, false)
                )
            );

        // Redirect back to notifications page
        return redirect('/notifications', 302);
    } catch (e) {
        console.error('Error marking all as read:', e);
        return serverError('Failed to mark notifications as read');
    }
};
