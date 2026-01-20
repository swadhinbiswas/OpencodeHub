/**
 * Mark all notifications as read
 */
import { type APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from '@/db';
import { notifications } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { withErrorHandler, Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export const POST: APIRoute = withErrorHandler(async ({ request, redirect }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        throw Errors.unauthorized();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const timestamp = new Date();

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

    logger.info({ userId: tokenPayload.userId }, "Marked all notifications as read");

    // Redirect back to notifications page
    return redirect('/notifications', 302);
});
