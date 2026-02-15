/**
 * Repository API - Get, update, delete single repository
 */
import type { APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from "@/db";
import { repositories, repositoryCollaborators, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import { canAdminRepo, canWriteRepo } from '@/lib/permissions';
import { isCloudStorage, deleteRepoFromStorage } from '@/lib/git-storage';
import {
  success,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
  noContent,
  parseBody,
} from '@/lib/api';
import { now } from '@/lib/utils';
import { deleteRepository as deleteGitRepo } from '@/lib/git';

const updateRepoSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  visibility: z.enum(['public', 'private', 'internal']).optional(),
  defaultBranch: z.string().optional(),
  hasIssues: z.boolean().optional(),
  hasWiki: z.boolean().optional(),
  hasActions: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  isTemplate: z.boolean().optional(),
  topics: z.array(z.string()).optional(),
  website: z.string().optional(),
});

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) {
    return badRequest('Owner and repository name required');
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const tokenPayload = await getUserFromRequest(request);

  // Find owner user
  const ownerUser = await db.query.users.findFirst({
    where: eq(users.username, owner),
  });

  if (!ownerUser) {
    return notFound('User not found');
  }

  // Find repository
  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.ownerId, ownerUser.id),
      eq(repositories.name, repo)
    ),
    with: {
      owner: {
        columns: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!repository) {
    return notFound('Repository not found');
  }

  // Check access
  const isOwner = tokenPayload?.userId === repository.ownerId;
  const isAdmin = tokenPayload?.isAdmin;

  if (repository.visibility === 'private' && !isOwner && !isAdmin) {
    // Check if user is a collaborator
    if (tokenPayload) {
      const collab = await db.query.repositoryCollaborators.findFirst({
        where: and(
          eq(repositoryCollaborators.repositoryId, repository.id),
          eq(repositoryCollaborators.userId, tokenPayload.userId)
        ),
      });
      if (!collab) {
        return notFound('Repository not found');
      }
    } else {
      return notFound('Repository not found');
    }
  }

  // Calculate permissions properly
  const hasPush = tokenPayload
    ? await canWriteRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin })
    : false;
  const hasAdmin = tokenPayload
    ? await canAdminRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin })
    : false;

  // Get additional data
  const data = {
    id: repository.id,
    name: repository.name,
    slug: repository.slug,
    fullName: `${repository.owner.username}/${repository.name}`,
    description: repository.description,
    visibility: repository.visibility,
    defaultBranch: repository.defaultBranch,
    starCount: repository.starCount,
    forkCount: repository.forkCount,
    watchCount: repository.watchCount,
    openIssueCount: repository.openIssueCount,
    openPrCount: repository.openPrCount,
    size: repository.size,
    language: repository.language,
    languages: repository.languages ? JSON.parse(repository.languages) : {},
    topics: repository.topics ? JSON.parse(repository.topics) : [],
    isFork: repository.isFork,
    isArchived: repository.isArchived,
    isMirror: repository.isMirror,
    hasIssues: repository.hasIssues,
    hasWiki: repository.hasWiki,
    hasActions: repository.hasActions,
    allowForking: repository.allowForking,
    licenseType: repository.licenseType,
    sshCloneUrl: repository.sshCloneUrl,
    httpCloneUrl: repository.httpCloneUrl,
    lastActivityAt: repository.lastActivityAt,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
    owner: repository.owner,
    permissions: {
      admin: hasAdmin,
      push: hasPush,
      pull: true,
    },
  };

  return success(data);
});

export const PATCH: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) {
    return badRequest('Owner and repository name required');
  }

  // Require authentication
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Find owner user
  const ownerUser = await db.query.users.findFirst({
    where: eq(users.username, owner),
  });

  if (!ownerUser) {
    return notFound('User not found');
  }

  // Find repository
  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.ownerId, ownerUser.id),
      eq(repositories.name, repo)
    ),
  });

  if (!repository) {
    return notFound('Repository not found');
  }

  // Check permission
  const hasPermission = await canWriteRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin });

  if (!hasPermission) {
    return forbidden('You do not have permission to update this repository');
  }

  // Parse and validate request body
  const parsed = await parseBody(request, updateRepoSchema);
  if ('error' in parsed) return parsed.error;

  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  };

  // Map fields to update
  const { name, description, visibility, defaultBranch, hasIssues, hasWiki, hasActions, isArchived, topics } = parsed.data;
  const { isTemplate } = parsed.data;

  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (visibility !== undefined) updateData.visibility = visibility;
  if (defaultBranch !== undefined) updateData.defaultBranch = defaultBranch;
  if (hasIssues !== undefined) updateData.hasIssues = hasIssues;
  if (hasWiki !== undefined) updateData.hasWiki = hasWiki;
  if (hasActions !== undefined) updateData.hasActions = hasActions;
  if (isArchived !== undefined) updateData.isArchived = isArchived;
  if (isTemplate !== undefined) {
    const hasAdminPermission = await canAdminRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin });
    if (!hasAdminPermission) {
      return forbidden('You do not have permission to update template status');
    }
    updateData.isTemplate = isTemplate;
  }
  if (topics !== undefined) updateData.topics = JSON.stringify(topics);

  // Update repository
  await db
    .update(repositories)
    .set(updateData)
    .where(eq(repositories.id, repository.id));

  // Get updated repository
  const updatedRepo = await db.query.repositories.findFirst({
    where: eq(repositories.id, repository.id),
    with: {
      owner: {
        columns: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  logger.info({ repoId: repository.id, userId: tokenPayload.userId }, "Repository updated");

  return success({
    id: updatedRepo!.id,
    name: updatedRepo!.name,
    slug: updatedRepo!.slug,
    fullName: `${updatedRepo!.owner.username}/${updatedRepo!.name}`,
    description: updatedRepo!.description,
    visibility: updatedRepo!.visibility,
    defaultBranch: updatedRepo!.defaultBranch,
    hasIssues: updatedRepo!.hasIssues,
    hasWiki: updatedRepo!.hasWiki,
    hasActions: updatedRepo!.hasActions,
    isArchived: updatedRepo!.isArchived,
    isTemplate: updatedRepo!.isTemplate,
    topics: updatedRepo!.topics ? JSON.parse(updatedRepo!.topics) : [],
    owner: updatedRepo!.owner,
    updatedAt: updatedRepo!.updatedAt,
  });
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) {
    return badRequest('Owner and repository name required');
  }

  // Require authentication
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Find owner user
  const ownerUser = await db.query.users.findFirst({
    where: eq(users.username, owner),
  });

  if (!ownerUser) {
    return notFound('User not found');
  }

  // Find repository
  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.ownerId, ownerUser.id),
      eq(repositories.name, repo)
    ),
  });

  if (!repository) {
    return notFound('Repository not found');
  }

  // Check permission (only admin/owner can delete)
  const hasPermission = await canAdminRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin });

  if (!hasPermission) {
    return forbidden('You do not have permission to delete this repository');
  }

  // Delete git repository from disk
  try {
    await deleteGitRepo(repository.diskPath);
  } catch (error) {
    logger.error({ err: error, diskPath: repository.diskPath }, 'Failed to delete git repository on disk');
    // Continue anyway to clean up database
  }

  // Delete from cloud storage if applicable
  try {
    if (await isCloudStorage()) {
      await deleteRepoFromStorage(repository.diskPath);
      logger.info({ diskPath: repository.diskPath }, 'Repository deleted from cloud storage');
    }
  } catch (error) {
    logger.error({ err: error, diskPath: repository.diskPath }, 'Failed to delete repository from cloud storage');
    // Continue anyway to clean up database
  }

  // Clear forkedFromId references from any forks of this repo
  await db.update(repositories)
    .set({ forkedFromId: null })
    .where(eq(repositories.forkedFromId, repository.id));

  // Delete from database (cascades to related tables)
  await db.delete(repositories).where(eq(repositories.id, repository.id));

  logger.info({ repoId: repository.id, userId: tokenPayload.userId }, "Repository deleted");

  return noContent();
});
