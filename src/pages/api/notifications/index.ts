/**
 * Notifications API - List, read, archive notifications
 */
import { type APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, desc, and, or } from 'drizzle-orm';
import {  getDatabase , schema } from "@/db";
import { notifications } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/api';

const BLOCKING_NOTIFICATION_TYPES = [
    "ci_failed",
    "review_request",
    "security_alert",
    "merge_conflict",
    "merge_blocked",
];

const BLOCKING_NOTIFICATION_REASONS = [
    "ci_failed",
    "review_requested",
    "security_alert",
    "merge_conflict",
    "merge_blocked",
];

export const GET: APIRoute = async ({ request, url }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const db = getDatabase() as NodePgDatabase<typeof schema>;
        const filter = url.searchParams.get('filter') || 'unread';

        let conditions = [eq(notifications.userId, tokenPayload.userId)];

        if (filter === 'unread') {
            conditions.push(eq(notifications.isRead, false));
            conditions.push(eq(notifications.isArchived, false));
        } else if (filter === 'read') {
            conditions.push(eq(notifications.isRead, true));
            conditions.push(eq(notifications.isArchived, false));
        } else if (filter === 'archived') {
            conditions.push(eq(notifications.isArchived, true));
        } else if (filter === 'blocking') {
            conditions.push(eq(notifications.isArchived, false));
            conditions.push(
                or(
                    ...BLOCKING_NOTIFICATION_TYPES.map((type) => eq(notifications.type, type)),
                    ...BLOCKING_NOTIFICATION_REASONS.map((reason) => eq(notifications.reason, reason))
                )!
            );
        } else {
            // all - just exclude archived
            conditions.push(eq(notifications.isArchived, false));
        }

        const notifs = await db.query.notifications.findMany({
            where: and(...conditions),
            orderBy: [desc(notifications.createdAt)],
            limit: 100,
            with: {
                actor: {
                    columns: { id: true, username: true, displayName: true, avatarUrl: true }
                },
                repository: {
                    columns: { id: true, name: true, slug: true }
                },
            },
        });

        // Get unread count
        const unreadNotifs = await db.query.notifications.findMany({
            where: and(
                eq(notifications.userId, tokenPayload.userId),
                eq(notifications.isRead, false),
                eq(notifications.isArchived, false)
            ),
        });

        return success({
            notifications: notifs,
            unreadCount: unreadNotifs.length,
        });
    } catch (e) {
        console.error('Error fetching notifications:', e);
        return serverError('Failed to fetch notifications');
    }
};
