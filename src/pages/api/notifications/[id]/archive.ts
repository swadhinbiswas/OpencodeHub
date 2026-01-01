/**
 * Archive notification
 */
import { type APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { notifications } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { unauthorized, notFound, serverError } from '@/lib/api';

export const POST: APIRoute = async ({ params, request, redirect }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const { id } = params;
        if (!id) {
            return notFound('Notification not found');
        }

        const db = getDatabase();
        const timestamp = new Date().toISOString();

        // Verify ownership and update
        const notification = await db.query.notifications.findFirst({
            where: and(
                eq(notifications.id, id),
                eq(notifications.userId, tokenPayload.userId)
            ),
        });

        if (!notification) {
            return notFound('Notification not found');
        }

        await db
            .update(notifications)
            .set({
                isArchived: true,
                archivedAt: timestamp,
                updatedAt: timestamp
            })
            .where(eq(notifications.id, id));

        // Redirect back
        return redirect('/notifications', 302);
    } catch (e) {
        console.error('Error archiving notification:', e);
        return serverError('Failed to archive notification');
    }
};
