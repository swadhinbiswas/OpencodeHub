/**
 * Labels API - Manage repository labels
 */
import { type APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from "@/db";
import { labels, repositories, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { canWriteRepo } from '@/lib/permissions';
import { success, created, badRequest, unauthorized, notFound, serverError, forbidden } from '@/lib/api';
import { generateId, now } from '@/lib/utils';

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

// GET - List labels
export const GET: APIRoute = withErrorHandler(async ({ params }) => {
    const { owner, repo } = params;
    if (!owner || !repo) return badRequest('Missing owner or repo');

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

    // Get labels
    const repoLabels = await db.query.labels.findMany({
        where: eq(labels.repositoryId, repository.id),
    });

    return success({ labels: repoLabels });
});

// POST - Create label
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

    // Check write permission
    if (!await canWriteRepo(tokenPayload.userId, repository)) {
        return forbidden('You do not have permission to manage labels');
    }

    // Parse body
    const body = await request.json();
    const { name, color, description } = body;

    if (!name) return badRequest('Label name is required');

    // Check if label already exists
    const existing = await db.query.labels.findFirst({
        where: and(
            eq(labels.repositoryId, repository.id),
            eq(labels.name, name)
        ),
    });
    if (existing) return badRequest('Label already exists');

    // Create label
    const labelId = generateId('label');
    const now = new Date();
    await db.insert(labels).values({
        id: labelId,
        repositoryId: repository.id,
        name,
        color: color || '#6b7280',
        description: description || null,
        createdAt: now,
    });

    logger.info({ userId: tokenPayload.userId, repoId: repository.id, labelId, name }, "Label created");

    return created({
        id: labelId,
        name,
        color: color || '#6b7280',
    });
});
