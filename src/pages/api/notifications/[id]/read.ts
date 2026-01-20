/**
 * Mark single notification as read
 */
import { type APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from '@/db';
import { notifications } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { withErrorHandler, Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export const POST: APIRoute = withErrorHandler(async ({ params, request, redirect }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        throw Errors.unauthorized();
    }

    const { id } = params;
    if (!id) {
        throw Errors.notFound('Notification not found');
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const timestamp = new Date();

    // Verify ownership and update
    const notification = await db.query.notifications.findFirst({
        where: and(
            eq(notifications.id, id),
            eq(notifications.userId, tokenPayload.userId)
        ),
    });

    if (!notification) {
        throw Errors.notFound('Notification not found');
    }

    await db
        .update(notifications)
        .set({
            isRead: true,
            readAt: timestamp,
            updatedAt: timestamp
        })
        .where(eq(notifications.id, id));

    logger.debug({ notificationId: id, userId: tokenPayload.userId }, "Marked notification as read");

    // Redirect back
    return redirect('/notifications', 302);
});
