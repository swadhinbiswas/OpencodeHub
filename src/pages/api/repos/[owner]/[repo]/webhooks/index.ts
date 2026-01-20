/**
 * Webhooks API - Manage repository webhooks
 */
import { type APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from "@/db";
import { webhooks, repositories, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { canAdminRepo } from '@/lib/permissions';
import { success, created, badRequest, unauthorized, notFound, serverError, forbidden } from '@/lib/api';
import { generateId, now } from '@/lib/utils';
import crypto from 'crypto';

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

// GET - List webhooks
export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
    const { owner, repo } = params;
    if (!owner || !repo) return badRequest('Missing owner or repo');

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
            events: h.events || [],
            active: h.active,
            lastDeliveryAt: h.lastDeliveryAt,
            lastDeliveryStatus: h.lastDeliveryStatus,
            createdAt: h.createdAt,
        }))
    });
});

// POST - Add webhook
export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
    const { owner, repo } = params;
    if (!owner || !repo) return badRequest('Missing owner or repo');

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
    const timestamp = new Date();

    await db.insert(webhooks).values({
        id: webhookId,
        repositoryId: repository.id,
        url,
        secret: hashedSecret,
        events: JSON.stringify(events),
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
    });

    logger.info({ userId: tokenPayload.userId, repoId: repository.id, webhookId, url }, "Webhook created");

    return created({
        id: webhookId,
        url,
        events,
    });
});
