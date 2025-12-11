---
/**
 * Repositories API - List and create repositories
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq, desc, and, or, like, sql } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { repositories, repositoryCollaborators, users } from '@/db/schema';
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
});

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const db = getDatabase();
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
      .select({ count: sql<number>`count(*)` })
      .from(repositories)
      .where(and(...conditions));

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
  } catch (error) {
    console.error('List repositories error:', error);
    return serverError('Failed to list repositories');
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    // Require authentication
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
      return unauthorized();
    }

    // Parse and validate request body
    const parsed = await parseBody(request, createRepoSchema);
    if ('error' in parsed) return parsed.error;

    const {
      name,
      description,
      visibility,
      defaultBranch,
      hasIssues,
      hasWiki,
      hasActions,
      licenseType,
      gitignoreTemplate,
      readme,
    } = parsed.data;

    // Validate repo name
    if (!isValidRepoName(name)) {
      return badRequest(
        'Invalid repository name. Use only letters, numbers, dots, hyphens, and underscores.'
      );
    }

    const db = getDatabase();
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

    // Create repository record
    const repoId = generateId('repo');
    const timestamp = now();
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const sshPort = process.env.GIT_SSH_PORT || '2222';
    const reposPath = process.env.GIT_REPOS_PATH || './data/repositories';
    const diskPath = `${reposPath}/${user.username}/${slug}.git`;

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
      sshCloneUrl: `ssh://git@localhost:${sshPort}/${user.username}/${slug}.git`,
      httpCloneUrl: `${siteUrl}/${user.username}/${slug}.git`,
      hasIssues,
      hasWiki,
      hasActions,
      licenseType,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Initialize git repository
    try {
      await initRepository(diskPath, {
        defaultBranch,
        readme,
        gitignoreTemplate,
        licenseType,
        repoName: name,
        ownerName: user.displayName || user.username,
      });
    } catch (error) {
      // Rollback database entry if git init fails
      await db.delete(repositories).where(eq(repositories.id, repoId));
      console.error('Git init error:', error);
      return serverError('Failed to initialize repository');
    }

    // Get created repo with owner
    const createdRepo = await db.query.repositories.findFirst({
      where: eq(repositories.id, repoId),
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
  } catch (error) {
    console.error('Create repository error:', error);
    return serverError('Failed to create repository');
  }
};
