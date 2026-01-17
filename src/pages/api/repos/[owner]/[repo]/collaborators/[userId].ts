/**
 * Single Collaborator API - Update/Remove collaborator
 */
import { type APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { repositoryCollaborators, repositories, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { canAdminRepo } from '@/lib/permissions';
import { success, badRequest, unauthorized, notFound, serverError, forbidden } from '@/lib/api';

// PATCH - Update collaborator role
export const PATCH: APIRoute = async ({ params, request }) => {
    try {
        const { owner, repo, userId } = params;
        if (!owner || !repo || !userId) return badRequest('Missing parameters');

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
        if (!await canAdminRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin })) {
            return forbidden('You do not have permission to manage collaborators');
        }

        // Find collaborator
        const collaborator = await db.query.repositoryCollaborators.findFirst({
            where: and(
                eq(repositoryCollaborators.repositoryId, repository.id),
                eq(repositoryCollaborators.userId, userId)
            ),
        });
        if (!collaborator) return notFound('Collaborator not found');

        // Parse body
        const body = await request.json();
        const { role } = body;

        if (!role) return badRequest('Role is required');
        if (!['maintainer', 'developer', 'guest'].includes(role)) {
            return badRequest('Invalid role. Must be: maintainer, developer, or guest');
        }

        // Update role
        await db.update(repositoryCollaborators)
            .set({ role })
            .where(eq(repositoryCollaborators.id, collaborator.id));

        return success({ message: 'Role updated', role });
    } catch (e) {
        console.error('Error updating collaborator:', e);
        return serverError('Failed to update collaborator');
    }
};

// DELETE - Remove collaborator
export const DELETE: APIRoute = async ({ params, request }) => {
    try {
        const { owner, repo, userId } = params;
        if (!owner || !repo || !userId) return badRequest('Missing parameters');

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

        // Check admin permission OR user is removing themselves
        const isRepoAdmin = await canAdminRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin });
        const isSelf = tokenPayload.userId === userId;

        if (!isRepoAdmin && !isSelf) {
            return forbidden('You do not have permission to remove this collaborator');
        }

        // Find collaborator
        const collaborator = await db.query.repositoryCollaborators.findFirst({
            where: and(
                eq(repositoryCollaborators.repositoryId, repository.id),
                eq(repositoryCollaborators.userId, userId)
            ),
        });
        if (!collaborator) return notFound('Collaborator not found');

        // Delete
        await db.delete(repositoryCollaborators)
            .where(eq(repositoryCollaborators.id, collaborator.id));

        return success({ message: 'Collaborator removed' });
    } catch (e) {
        console.error('Error removing collaborator:', e);
        return serverError('Failed to remove collaborator');
    }
};
