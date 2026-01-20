/**
 * Single Webhook API - Update/Delete/Test webhook
 */
import { type APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from "@/db";
import { webhooks, repositories, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { canAdminRepo } from '@/lib/permissions';
import { success, badRequest, unauthorized, notFound, serverError, forbidden } from '@/lib/api';
import { now } from '@/lib/utils';

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

// PATCH - Update webhook
export const PATCH: APIRoute = withErrorHandler(async ({ params, request }) => {
    const { owner, repo, id } = params;
    if (!owner || !repo || !id) return badRequest('Missing parameters');

    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) return unauthorized();

    const db = getDatabase() as NodePgDatabase<typeof schema>;

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

    const updates: any = { updatedAt: new Date() };
    if (typeof isActive === 'boolean') updates.isActive = isActive;
    if (url) updates.url = url;
    if (events && Array.isArray(events)) updates.events = JSON.stringify(events);

    await db.update(webhooks)
        .set(updates)
        .where(eq(webhooks.id, id));

    logger.info({ userId: tokenPayload.userId, repoId: repository.id, webhookId: id, updates }, "Webhook updated");

    return success({ message: 'Webhook updated' });
});

// DELETE - Remove webhook
export const DELETE: APIRoute = withErrorHandler(async ({ params, request }) => {
    const { owner, repo, id } = params;
    if (!owner || !repo || !id) return badRequest('Missing parameters');

    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) return unauthorized();

    const db = getDatabase() as NodePgDatabase<typeof schema>;

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

    logger.info({ userId: tokenPayload.userId, repoId: repository.id, webhookId: id }, "Webhook deleted");

    return success({ message: 'Webhook deleted' });
});
