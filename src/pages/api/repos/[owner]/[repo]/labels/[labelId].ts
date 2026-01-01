/**
 * Single Label API - Update/Delete label
 */
import { type APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { labels, repositories, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { canWriteRepo } from '@/lib/permissions';
import { success, badRequest, unauthorized, notFound, serverError, forbidden } from '@/lib/api';

// PATCH - Update label
export const PATCH: APIRoute = async ({ params, request }) => {
    try {
        const { owner, repo, labelId } = params;
        if (!owner || !repo || !labelId) return badRequest('Missing parameters');

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

        // Check write permission
        if (!await canWriteRepo(tokenPayload.userId, repository)) {
            return forbidden('You do not have permission to manage labels');
        }

        // Find label
        const label = await db.query.labels.findFirst({
            where: and(
                eq(labels.repositoryId, repository.id),
                eq(labels.id, labelId)
            ),
        });
        if (!label) return notFound('Label not found');

        // Parse body
        const body = await request.json();
        const { name, color, description } = body;

        const updates: any = {};
        if (name) updates.name = name;
        if (color) updates.color = color;
        if (description !== undefined) updates.description = description || null;

        await db.update(labels)
            .set(updates)
            .where(eq(labels.id, labelId));

        return success({ message: 'Label updated' });
    } catch (e) {
        console.error('Error updating label:', e);
        return serverError('Failed to update label');
    }
};

// DELETE - Remove label
export const DELETE: APIRoute = async ({ params, request }) => {
    try {
        const { owner, repo, labelId } = params;
        if (!owner || !repo || !labelId) return badRequest('Missing parameters');

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

        // Check write permission
        if (!await canWriteRepo(tokenPayload.userId, repository)) {
            return forbidden('You do not have permission to manage labels');
        }

        // Find and delete label
        const label = await db.query.labels.findFirst({
            where: and(
                eq(labels.repositoryId, repository.id),
                eq(labels.id, labelId)
            ),
        });
        if (!label) return notFound('Label not found');

        await db.delete(labels).where(eq(labels.id, labelId));

        return success({ message: 'Label deleted' });
    } catch (e) {
        console.error('Error deleting label:', e);
        return serverError('Failed to delete label');
    }
};
