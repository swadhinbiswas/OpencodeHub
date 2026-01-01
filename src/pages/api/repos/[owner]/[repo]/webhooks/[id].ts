/**
 * Single Webhook API - Update/Delete/Test webhook
 */
import { type APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { webhooks, repositories, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { canAdminRepo } from '@/lib/permissions';
import { success, badRequest, unauthorized, notFound, serverError, forbidden } from '@/lib/api';
import { now } from '@/lib/utils';

// PATCH - Update webhook
export const PATCH: APIRoute = async ({ params, request }) => {
    try {
        const { owner, repo, id } = params;
        if (!owner || !repo || !id) return badRequest('Missing parameters');

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

        // Find webhook
        const webhook = await db.query.webhooks.findFirst({
            where: and(
                eq(webhooks.repositoryId, repository.id),
                eq(webhooks.id, id)
            ),
        });
        if (!webhook) return notFound('Webhook not found');

        // Parse body
        const body = await request.json();
        const { isActive, url, events } = body;

        const updates: any = { updatedAt: now() };
        if (typeof isActive === 'boolean') updates.isActive = isActive;
        if (url) updates.url = url;
        if (events && Array.isArray(events)) updates.events = JSON.stringify(events);

        await db.update(webhooks)
            .set(updates)
            .where(eq(webhooks.id, id));

        return success({ message: 'Webhook updated' });
    } catch (e) {
        console.error('Error updating webhook:', e);
        return serverError('Failed to update webhook');
    }
};

// DELETE - Remove webhook
export const DELETE: APIRoute = async ({ params, request }) => {
    try {
        const { owner, repo, id } = params;
        if (!owner || !repo || !id) return badRequest('Missing parameters');

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

        // Find and delete webhook
        const webhook = await db.query.webhooks.findFirst({
            where: and(
                eq(webhooks.repositoryId, repository.id),
                eq(webhooks.id, id)
            ),
        });
        if (!webhook) return notFound('Webhook not found');

        await db.delete(webhooks).where(eq(webhooks.id, id));

        return success({ message: 'Webhook deleted' });
    } catch (e) {
        console.error('Error deleting webhook:', e);
        return serverError('Failed to delete webhook');
    }
};
