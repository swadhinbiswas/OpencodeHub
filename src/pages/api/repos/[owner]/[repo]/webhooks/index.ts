/**
 * Webhooks API - Manage repository webhooks
 */
import { type APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { webhooks, repositories, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { canAdminRepo } from '@/lib/permissions';
import { success, created, badRequest, unauthorized, notFound, serverError, forbidden } from '@/lib/api';
import { generateId, now } from '@/lib/utils';
import crypto from 'crypto';

// GET - List webhooks
export const GET: APIRoute = async ({ params, request }) => {
    try {
        const { owner, repo } = params;
        if (!owner || !repo) return badRequest('Missing owner or repo');

        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) return unauthorized();

        const db = getDatabase();

        // Find repo
        const ownerUser = await db.query.users.findFirst({
            where: eq(users.username, owner),
        });
        if (!ownerUser) return notFound('User not found');

        const repository = await db.query.repositories.findFirst({
            where: and(
                eq(repositories.ownerId, ownerUser.id),
                eq(repositories.name, repo)
            ),
        });
        if (!repository) return notFound('Repository not found');

        // Check admin permission
        if (!await canAdminRepo(tokenPayload.userId, repository)) {
            return forbidden('You do not have permission to view webhooks');
        }

        // Get webhooks
        const hooks = await db.query.webhooks.findMany({
            where: eq(webhooks.repositoryId, repository.id),
        });

        return success({
            webhooks: hooks.map(h => ({
                id: h.id,
                url: h.url,
                events: JSON.parse(h.events || '[]'),
                isActive: h.isActive,
                lastDeliveryAt: h.lastDeliveryAt,
                lastDeliveryStatus: h.lastDeliveryStatus,
                createdAt: h.createdAt,
            }))
        });
    } catch (e) {
        console.error('Error listing webhooks:', e);
        return serverError('Failed to list webhooks');
    }
};

// POST - Add webhook
export const POST: APIRoute = async ({ params, request }) => {
    try {
        const { owner, repo } = params;
        if (!owner || !repo) return badRequest('Missing owner or repo');

        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) return unauthorized();

        const db = getDatabase();

        // Find repo
        const ownerUser = await db.query.users.findFirst({
            where: eq(users.username, owner),
        });
        if (!ownerUser) return notFound('User not found');

        const repository = await db.query.repositories.findFirst({
            where: and(
                eq(repositories.ownerId, ownerUser.id),
                eq(repositories.name, repo)
            ),
        });
        if (!repository) return notFound('Repository not found');

        // Check admin permission
        if (!await canAdminRepo(tokenPayload.userId, repository)) {
            return forbidden('You do not have permission to manage webhooks');
        }

        // Parse body
        const body = await request.json();
        const { url, secret, events } = body;

        if (!url) return badRequest('URL is required');
        if (!events || !Array.isArray(events) || events.length === 0) {
            return badRequest('At least one event is required');
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            return badRequest('Invalid URL format');
        }

        // Hash secret if provided
        const hashedSecret = secret
            ? crypto.createHash('sha256').update(secret).digest('hex')
            : null;

        // Create webhook
        const webhookId = generateId('hook');
        const timestamp = now();

        await db.insert(webhooks).values({
            id: webhookId,
            repositoryId: repository.id,
            url,
            secret: hashedSecret,
            events: JSON.stringify(events),
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp,
        });

        return created({
            id: webhookId,
            url,
            events,
        });
    } catch (e) {
        console.error('Error adding webhook:', e);
        return serverError('Failed to add webhook');
    }
};
