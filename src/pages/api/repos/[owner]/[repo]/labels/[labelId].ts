/**
 * Single Label API - Update/Delete label
 */
import { type APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from "@/db";
import { labels, repositories, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { canWriteRepo } from '@/lib/permissions';
import { success, badRequest, unauthorized, notFound, serverError, forbidden } from '@/lib/api';

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

// PATCH - Update label
export const PATCH: APIRoute = withErrorHandler(async ({ params, request }) => {
    const { owner, repo, labelId } = params;
    if (!owner || !repo || !labelId) return badRequest('Missing parameters');

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

    logger.info({ userId: tokenPayload.userId, labelId, updates }, "Label updated");

    return success({ message: 'Label updated' });
});

// DELETE - Remove label
export const DELETE: APIRoute = withErrorHandler(async ({ params, request }) => {
    const { owner, repo, labelId } = params;
    if (!owner || !repo || !labelId) return badRequest('Missing parameters');

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

    // Find and delete label
    const label = await db.query.labels.findFirst({
        where: and(
            eq(labels.repositoryId, repository.id),
            eq(labels.id, labelId)
        ),
    });
    if (!label) return notFound('Label not found');

    await db.delete(labels).where(eq(labels.id, labelId));

    logger.info({ userId: tokenPayload.userId, labelId }, "Label deleted");

    return success({ message: 'Label deleted' });
});
