/**
 * Test Webhook API - Send a test ping
 */
import { type APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { webhooks, repositories, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { canAdminRepo } from '@/lib/permissions';
import { success, badRequest, unauthorized, notFound, serverError, forbidden } from '@/lib/api';
import { now } from '@/lib/utils';
import crypto from 'crypto';

// POST - Test webhook
export const POST: APIRoute = async ({ params, request }) => {
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
            return forbidden('You do not have permission to test webhooks');
        }

        // Find webhook
        const webhook = await db.query.webhooks.findFirst({
            where: and(
                eq(webhooks.repositoryId, repository.id),
                eq(webhooks.id, id)
            ),
        });
        if (!webhook) return notFound('Webhook not found');

        // Create test payload
        const payload = {
            action: 'ping',
            repository: {
                id: repository.id,
                name: repository.name,
                full_name: `${owner}/${repo}`,
                owner: { username: owner },
            },
            sender: {
                id: tokenPayload.userId,
            },
            hook_id: webhook.id,
            zen: 'Keep it simple.',
        };

        const payloadString = JSON.stringify(payload);

        // Create signature if secret exists
        let signature = '';
        if (webhook.secret) {
            signature = 'sha256=' + crypto
                .createHmac('sha256', webhook.secret)
                .update(payloadString)
                .digest('hex');
        }

        // Send test
        let status = 0;
        let responseText = '';

        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-OpenCodeHub-Event': 'ping',
                    'X-OpenCodeHub-Delivery': crypto.randomUUID(),
                    'X-OpenCodeHub-Signature-256': signature,
                },
                body: payloadString,
            });
            status = response.status;
            responseText = await response.text();
        } catch (e: any) {
            status = 0;
            responseText = e.message;
        }

        // Update webhook with delivery status
        await db.update(webhooks)
            .set({
                lastDeliveryAt: now(),
                lastDeliveryStatus: status,
                updatedAt: now(),
            })
            .where(eq(webhooks.id, id));

        return success({
            success: status >= 200 && status < 300,
            status,
            response: responseText.substring(0, 500),
        });
    } catch (e) {
        console.error('Error testing webhook:', e);
        return serverError('Failed to test webhook');
    }
};
