/**
 * Collaborators API - Manage repository collaborators
 */
import { type APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { repositoryCollaborators, repositories, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { canAdminRepo } from '@/lib/permissions';
import { success, created, badRequest, unauthorized, notFound, serverError, forbidden } from '@/lib/api';
import { generateId, now } from '@/lib/utils';

// GET - List collaborators
export const GET: APIRoute = async ({ params, request }) => {
    try {
        const { owner, repo } = params;
        if (!owner || !repo) return badRequest('Missing owner or repo');

        const db = getDatabase();
        const tokenPayload = await getUserFromRequest(request);

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

        // Check read access (collaborator list is semi-public for public repos)
        if (repository.visibility === 'private' && !tokenPayload) {
            return unauthorized();
        }

        // Get collaborators
        const collaborators = await db.query.repositoryCollaborators.findMany({
            where: eq(repositoryCollaborators.repositoryId, repository.id),
            with: {
                user: {
                    columns: { id: true, username: true, displayName: true, avatarUrl: true }
                },
                addedBy: {
                    columns: { id: true, username: true }
                }
            }
        });

        return success({
            collaborators: collaborators.map(c => ({
                id: c.id,
                userId: c.userId,
                username: c.user?.username,
                displayName: c.user?.displayName,
                avatarUrl: c.user?.avatarUrl,
                role: c.role,
                addedBy: c.addedBy?.username,
                createdAt: c.createdAt,
            }))
        });
    } catch (e) {
        console.error('Error listing collaborators:', e);
        return serverError('Failed to list collaborators');
    }
};

// POST - Add collaborator
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
            return forbidden('You do not have permission to manage collaborators');
        }

        // Parse body
        const body = await request.json();
        const { username, role = 'developer' } = body;

        if (!username) return badRequest('Username is required');
        if (!['maintainer', 'developer', 'guest'].includes(role)) {
            return badRequest('Invalid role. Must be: maintainer, developer, or guest');
        }

        // Find user to add
        const userToAdd = await db.query.users.findFirst({
            where: eq(users.username, username),
        });
        if (!userToAdd) return notFound('User not found');

        // Check if already a collaborator
        const existing = await db.query.repositoryCollaborators.findFirst({
            where: and(
                eq(repositoryCollaborators.repositoryId, repository.id),
                eq(repositoryCollaborators.userId, userToAdd.id)
            ),
        });
        if (existing) return badRequest('User is already a collaborator');

        // Can't add owner as collaborator
        if (userToAdd.id === repository.ownerId) {
            return badRequest('Cannot add repository owner as collaborator');
        }

        // Add collaborator
        const collabId = generateId('collab');
        await db.insert(repositoryCollaborators).values({
            id: collabId,
            repositoryId: repository.id,
            userId: userToAdd.id,
            role,
            addedById: tokenPayload.userId,
            createdAt: now(),
        });

        return created({
            id: collabId,
            userId: userToAdd.id,
            username: userToAdd.username,
            role,
        });
    } catch (e) {
        console.error('Error adding collaborator:', e);
        return serverError('Failed to add collaborator');
    }
};
