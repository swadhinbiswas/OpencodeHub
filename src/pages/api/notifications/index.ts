/**
 * Notifications API - List, read, archive notifications
 */
import { type APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, desc, and, or, isNull } from 'drizzle-orm';
import {  getDatabase , schema } from "@/db";
import { notifications } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/api';
import { scoreNotificationPriority } from '@/lib/notification-priority';
import {
    channelEnabled,
    computePersonalizationBoost,
    getRoutingDecision,
    type NotificationRouteChannel,
} from "@/lib/notification-routing";

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
        const prioritize = url.searchParams.get("prioritize") === "true";
        const personalize = url.searchParams.get("personalize") === "true";
        const rawChannel = url.searchParams.get("channel");
        const allowedChannels: NotificationRouteChannel[] = ["in_app", "email", "slack", "browser_push"];
        const channelFilter = rawChannel && allowedChannels.includes(rawChannel as NotificationRouteChannel)
            ? (rawChannel as NotificationRouteChannel)
            : null;

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

        const notifs = (await db.query.notifications.findMany({
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
        })) || [];

        const prefs = db.query.notificationPreferences
            ? await db.query.notificationPreferences.findMany({
                where: and(
                    eq(schema.notificationPreferences.userId, tokenPayload.userId),
                    isNull(schema.notificationPreferences.repositoryId)
                ),
            })
            : [];

        const recentHistory = (await db.query.notifications.findMany({
            where: and(
                eq(notifications.userId, tokenPayload.userId),
                eq(notifications.isArchived, false)
            ),
            orderBy: [desc(notifications.createdAt)],
            limit: 500,
            columns: { type: true, isRead: true },
        })) || [];

        const readByType: Record<string, number> = {};
        const unreadByType: Record<string, number> = {};
        let totalRead = 0;
        let totalHistory = 0;
        for (const item of recentHistory) {
            const type = item.type || "unknown";
            totalHistory++;
            if (item.isRead) {
                totalRead++;
                readByType[type] = (readByType[type] || 0) + 1;
            } else {
                unreadByType[type] = (unreadByType[type] || 0) + 1;
            }
        }
        const baselineReadRatio = totalHistory > 0 ? totalRead / totalHistory : 0.5;

        const notificationsWithPriority = notifs.map((notification) => {
            const scored = scoreNotificationPriority(notification);
            const routing = getRoutingDecision(notification.type, prefs as any);
            const personalizationBoost = personalize
                ? computePersonalizationBoost({
                    eventType: notification.type,
                    readByType,
                    unreadByType,
                    baselineReadRatio,
                })
                : 0;
            const priorityScore = Math.max(0, scored.score + personalizationBoost);
            return {
                ...notification,
                priority: scored.priority,
                priorityScore,
                isBlocking: scored.isBlocking,
                personalizationBoost,
                routeChannels: routing.channels,
                primaryRouteChannel: routing.primaryChannel,
            };
        });

        const routedNotifications = channelFilter
            ? notificationsWithPriority.filter((item) =>
                channelEnabled(channelFilter, {
                    channels: item.routeChannels,
                    primaryChannel: item.primaryRouteChannel,
                })
            )
            : notificationsWithPriority;

        if (prioritize) {
            routedNotifications.sort((a, b) => {
                if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
        }

        // Get unread count
        const unreadNotifs = (await db.query.notifications.findMany({
            where: and(
                eq(notifications.userId, tokenPayload.userId),
                eq(notifications.isRead, false),
                eq(notifications.isArchived, false)
            ),
        })) || [];

        return success({
            notifications: routedNotifications,
            unreadCount: unreadNotifs.length,
            routing: {
                channelFilter: channelFilter || null,
                personalized: personalize,
            },
        });
    } catch (e) {
        console.error('Error fetching notifications:', e);
        return serverError('Failed to fetch notifications');
    }
};
