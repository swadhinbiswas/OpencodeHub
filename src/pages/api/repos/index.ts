
/**
 * Repositories API - List and create repositories
 */
import { type APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from 'zod';
import { eq, desc, and, or, like, count } from 'drizzle-orm';
import { getDatabase, schema } from "@/db";
import { repositories, users } from '@/db/schema';
import { getUserFromRequest } from '@/lib/auth';
import {
  success,
  created,
  badRequest,
  unauthorized,
  conflict,
  serverError,
  parseBody,
  getPagination,
  paginationMeta,
} from '@/lib/api';
import { generateId, now, slugify, isValidRepoName } from '@/lib/utils';
import { initRepository } from '@/lib/git';
import { getDiskPath, initRepoInStorage, finalizeRepoInit, isCloudStorage } from '@/lib/git-storage';

const createRepoSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  visibility: z.enum(['public', 'private', 'internal']).default('public'),
  defaultBranch: z.string().default('main'),
  hasIssues: z.boolean().default(true),
  hasWiki: z.boolean().default(true),
  hasActions: z.boolean().default(true),
  licenseType: z.string().optional(),
  gitignoreTemplate: z.string().optional(),
  readme: z.boolean().default(true),
  templateRepoId: z.string().optional(),
  includeAllBranches: z.boolean().default(false),
});

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity";
import { initializeDefaultTemplates } from "@/lib/review-templates";
import { createFromTemplate } from "@/lib/repo-templates";

// ... existing imports ...

export const GET: APIRoute = withErrorHandler(async ({ request, url }) => {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const pagination = getPagination(url);

  // Get user if authenticated (optional for public repos)
  const tokenPayload = await getUserFromRequest(request);
  const userId = tokenPayload?.userId;

  // Parse query params
  const query = url.searchParams.get('q') || '';
  const visibility = url.searchParams.get('visibility');
  const sort = url.searchParams.get('sort') || 'updated';
  const owner = url.searchParams.get('owner');

  // Build query conditions
  let conditions = [];

  // If not authenticated, only show public repos
  if (!userId) {
    conditions.push(eq(repositories.visibility, 'public'));
  } else if (!tokenPayload?.isAdmin) {
    // Show public repos + user's own repos + repos they collaborate on
    conditions.push(
      or(
        eq(repositories.visibility, 'public'),
        eq(repositories.ownerId, userId)
      )
    );
  }

  // Filter by owner
  if (owner) {
    const ownerUser = await db.query.users.findFirst({
      where: eq(users.username, owner),
    });
    if (ownerUser) {
      conditions.push(eq(repositories.ownerId, ownerUser.id));
    }
  }

  // Filter by visibility
  if (visibility && ['public', 'private', 'internal'].includes(visibility)) {
    conditions.push(eq(repositories.visibility, visibility));
  }

  // Search filter
  if (query) {
    conditions.push(
      or(
        like(repositories.name, `%${query}%`),
        like(repositories.description, `%${query}%`)
      )
    );
  }

  // Not archived by default
  conditions.push(eq(repositories.isArchived, false));

  // Build order by
  const orderByMap: Record<string, any> = {
    updated: desc(repositories.updatedAt),
    created: desc(repositories.createdAt),
    name: repositories.name,
    stars: desc(repositories.starCount),
  };

  const orderBy = orderByMap[sort] || orderByMap.updated;

  // Get total count
  const countResult = await db
    .select({ count: count() })
    .from(repositories)
    .where(and(...conditions)) as any;

  const total = countResult[0]?.count || 0;

  // Get repositories with pagination
  const repos = await db.query.repositories.findMany({
    where: and(...conditions),
    orderBy,
    limit: pagination.perPage,
    offset: pagination.offset,
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

  // Transform for response
  const data = repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    slug: repo.slug,
    fullName: `${repo.owner.username}/${repo.name}`,
    description: repo.description,
    visibility: repo.visibility,
    defaultBranch: repo.defaultBranch,
    starCount: repo.starCount,
    forkCount: repo.forkCount,
    watchCount: repo.watchCount,
    openIssueCount: repo.openIssueCount,
    language: repo.language,
    topics: repo.topics ? JSON.parse(repo.topics) : [],
    isFork: repo.isFork,
    isArchived: repo.isArchived,
    sshCloneUrl: repo.sshCloneUrl,
    httpCloneUrl: repo.httpCloneUrl,
    updatedAt: repo.updatedAt,
    createdAt: repo.createdAt,
    owner: repo.owner,
  }));

  return success(data, paginationMeta(total, pagination));
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  // Require authentication
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  // Parse and validate request body
  const parsed = await parseBody(request, createRepoSchema);
  if ('error' in parsed) return parsed.error;

  /* Force lowercase for consistency */
  const name = parsed.data.name.toLowerCase();

  const {
    description,
    visibility,
    defaultBranch,
    hasIssues,
    hasWiki,
    hasActions,
    licenseType,
    gitignoreTemplate,
    readme,
    templateRepoId,
    includeAllBranches,
  } = parsed.data;

  // Validate repo name
  if (!isValidRepoName(name)) {
    return badRequest(
      'Invalid repository name. Use only lowercase letters, numbers, dots, hyphens, and underscores.'
    );
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const slug = slugify(name);

  // Check if repo already exists for this user
  const existingRepo = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.ownerId, tokenPayload.userId),
      or(eq(repositories.name, name), eq(repositories.slug, slug))
    ),
  });

  if (existingRepo) {
    return conflict('Repository with this name already exists');
  }

  // Get user for URLs
  const user = await db.query.users.findFirst({
    where: eq(users.id, tokenPayload.userId),
  });

  if (!user) {
    return unauthorized();
  }

  const repoId = generateId('repo');
  const timestamp = new Date();
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  const sshPort = process.env.GIT_SSH_PORT || '2222';
  const diskPath = await getDiskPath(user.username, slug);
  const sshCloneUrl = `ssh://git@localhost:${sshPort}/${user.username}/${slug}.git`;
  const httpCloneUrl = `${siteUrl}/${user.username}/${slug}.git`;

  if (templateRepoId) {
    const templateRepo = await db.query.repositories.findFirst({
      where: eq(repositories.id, templateRepoId),
      with: { owner: true },
    });

    if (!templateRepo || !templateRepo.isTemplate) {
      return badRequest('Template repository not found');
    }

    const canUseTemplate =
      tokenPayload.isAdmin ||
      templateRepo.ownerId === tokenPayload.userId ||
      templateRepo.visibility === 'public' ||
      templateRepo.visibility === 'internal';

    if (!canUseTemplate) {
      return forbidden('You do not have permission to use this template');
    }

    const result = await createFromTemplate({
      templateRepoId,
      newOwnerId: tokenPayload.userId,
      newOwnerUsername: user.username,
      newName: name,
      newDescription: description,
      visibility,
      includeAllBranches,
      diskPath,
      sshCloneUrl,
      httpCloneUrl,
      hasIssues,
      hasWiki,
      hasActions,
      licenseType,
    });

    if (!result.success || !result.repositoryId) {
      logger.error({ err: result.error, templateRepoId }, 'Template repo creation failed');
      return serverError(result.error || 'Failed to create from template');
    }
  } else {
    await db.insert(repositories).values({
      id: repoId,
      name,
      slug,
      description,
      ownerId: tokenPayload.userId,
      ownerType: 'user',
      visibility,
      defaultBranch,
      diskPath,
      sshCloneUrl,
      httpCloneUrl,
      hasIssues,
      hasWiki,
      hasActions,
      licenseType,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Initialize git repository immediately (fast, ~100ms)
    // Upload to S3 happens asynchronously to not block response
    try {
      // Get local path for git operations (temp path for cloud storage, direct path for local)
      const localGitPath = await initRepoInStorage(user.username, slug);

      await initRepository(localGitPath, {
        defaultBranch,
        readme: false, // No README on creation to keep it fast
        gitignoreTemplate,
        licenseType,
        repoName: name,
        ownerName: user.displayName || user.username,
      });

      // If using cloud storage, upload asynchronously (don't wait)
      const isCloud = await isCloudStorage();

      if (isCloud) {
        logger.info('Uploading to cloud storage (async)...');
        // Fire-and-forget async upload
        finalizeRepoInit(user.username, slug)
          .then(() => logger.info({ repoId, diskPath }, 'Repository uploaded to S3'))
          .catch((err) => logger.error({ err, repoId }, 'Background S3 upload failed'));
      }

      logger.info({ repoId, diskPath }, 'Repository initialized and ready (S3 upload in progress if cloud)');
    } catch (error) {
      // Rollback database entry if git init fails
      await db.delete(repositories).where(eq(repositories.id, repoId));
      logger.error({ err: error, repoId, diskPath }, 'Git init error');
      return serverError('Failed to initialize repository');
    }
  }

  // Get created repo with owner
  const createdRepo = await db.query.repositories.findFirst({
    where: and(eq(repositories.ownerId, tokenPayload.userId), eq(repositories.name, name)),
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

  logger.info({ repoId: createdRepo!.id, userId: user.id }, "Repository created");

  // Log activity
  await logActivity(
    user.id,
    "create_repo",
    "created",
    "repository",
    createdRepo!.id,
    createdRepo!.id,
    { name: createdRepo!.name, description: createdRepo!.description }
  );

  // Seed default review templates (best effort)
  try {
    await initializeDefaultTemplates(createdRepo!.id, user.id);
  } catch (error) {
    logger.warn({ repoId: createdRepo!.id, error }, "Failed to initialize review templates");
  }

  return created({
    id: createdRepo!.id,
    name: createdRepo!.name,
    slug: createdRepo!.slug,
    fullName: `${user.username}/${name}`,
    description: createdRepo!.description,
    visibility: createdRepo!.visibility,
    defaultBranch: createdRepo!.defaultBranch,
    sshCloneUrl: createdRepo!.sshCloneUrl,
    httpCloneUrl: createdRepo!.httpCloneUrl,
    owner: createdRepo!.owner,
    createdAt: createdRepo!.createdAt,
  });
});
