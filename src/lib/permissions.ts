import { getDatabase, schema } from "@/db";
import type { Repository } from "@/db/schema";
import { repositoryCollaborators, teamRepositories } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export type PermissionLevel = "admin" | "write" | "read" | "none";
export type OrgPermissionLevel = "owner" | "admin" | "member" | "none";

export interface PermissionOptions {
  /** If true, the user is a site-wide admin with full access to all repositories */
  isAdmin?: boolean;
  /** Fine-grained PAT scopes from the token payload (undefined = legacy full access) */
  tokenScopes?: string[];
}

export const PAT_SCOPES = ["repo:read", "repo:write", "admin", "notifications"] as const;
export type PatScope = (typeof PAT_SCOPES)[number];

/**
 * Check whether a token payload is permitted to perform an action.
 * Legacy tokens (no scopes) keep full access; scoped tokens must
 * declare the required scope. `admin` implies all other scopes.
 */
export function hasPatScope(
  tokenScopes: string[] | undefined,
  required: PatScope | PatScope[],
): boolean {
  if (!tokenScopes || tokenScopes.length === 0) return true; // legacy full access
  const requiredScopes = Array.isArray(required) ? required : [required];
  return requiredScopes.every(
    (s) => tokenScopes.includes(s) || tokenScopes.includes("admin"),
  );
}

/**
 * Effective write permission for a repo under a scoped PAT:
 * a token with only `repo:read` cannot perform write operations.
 */
export function hasRepoWriteScope(
  tokenScopes: string[] | undefined,
): boolean {
  if (!tokenScopes || tokenScopes.length === 0) return true; // legacy full access
  return (
    tokenScopes.includes("repo:write") || tokenScopes.includes("admin")
  );
}

export async function getRepoPermission(
  userId: string | undefined,
  repo: Repository,
  options?: PermissionOptions,
): Promise<PermissionLevel> {
  // Site-wide admins have full access to all repositories
  if (options?.isAdmin) {
    return "admin";
  }

  // Public repos are readable by everyone
  if (repo.visibility === "public") {
    if (!userId) return "read";
  } else {
    // Private repos are not readable by anonymous users
    if (!userId) return "none";
  }

  // Owner has full access
  if (userId && repo.ownerId === userId) {
    return "admin";
  }

  if (!userId) return "none";

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Check collaborator status
  const collaborator = await db.query.repositoryCollaborators.findFirst({
    where: and(
      eq(repositoryCollaborators.repositoryId, repo.id),
      eq(repositoryCollaborators.userId, userId),
    ),
  });

  if (!collaborator) {
    // Check Organization Membership if repo is owned by an org
    if (repo.ownerType === "organization") {
      const orgMember = await db.query.organizationMembers.findFirst({
        where: and(
          eq(schema.organizationMembers.organizationId, repo.ownerId),
          eq(schema.organizationMembers.userId, userId),
        ),
        with: {
          // @ts-ignore - relation added in index.ts/roles.ts but might not be visible in types yet without generation
          // Actually we need to query customRole manually or rely on properly set up relations
        },
      });

      if (orgMember) {
        if (orgMember.role === "owner" || orgMember.role === "admin") {
          return "admin";
        }

        if (orgMember.customRoleId) {
          const customRole = await db.query.customRoles.findFirst({
            where: eq(schema.customRoles.id, orgMember.customRoleId),
          });

          if (customRole && customRole.permissions) {
            const perms = customRole.permissions as string[];
            if (perms.includes("repo:admin")) return "admin";
            if (perms.includes("repo:write")) return "write";
            if (perms.includes("repo:read")) return "read";
          }
        }

        // Default organization member access
        // Usually members can read internal/private repos
        return "read";
      }
    }

    // Check team-based repository permissions
    const userTeamMemberships = await db.query.teamMembers.findMany({
      where: eq(schema.teamMembers.userId, userId),
    });

    if (userTeamMemberships.length > 0) {
      const userTeamIds = userTeamMemberships.map((tm) => tm.teamId);
      const teamRepoPerms = await db
        .select({ permission: teamRepositories.permission })
        .from(teamRepositories)
        .where(
          and(
            inArray(teamRepositories.teamId, userTeamIds),
            eq(teamRepositories.repositoryId, repo.id),
          ),
        );

      if (teamRepoPerms.length > 0) {
        // Return the highest permission level found across all teams
        const permissionRank: Record<string, number> = {
          admin: 3,
          write: 2,
          read: 1,
        };
        let highest = "read";
        let highestRank = 0;
        for (const tp of teamRepoPerms) {
          const rank = permissionRank[tp.permission] ?? 0;
          if (rank > highestRank) {
            highestRank = rank;
            highest = tp.permission;
          }
        }
        return highest as PermissionLevel;
      }
    }

    return repo.visibility === "public" ? "read" : "none";
  }

  switch (collaborator.role) {
    case "owner":
    case "maintainer":
      return "admin";
    case "developer":
      return "write";
    case "guest":
      return "read";
    default:
      return "read";
  }
}

export async function getOrgPermission(
  userId: string | undefined,
  organizationId: string,
  options?: PermissionOptions,
): Promise<OrgPermissionLevel> {
  if (options?.isAdmin) {
    return "admin";
  }

  if (!userId) return "none";

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const orgMember = await db.query.organizationMembers.findFirst({
    where: and(
      eq(schema.organizationMembers.organizationId, organizationId),
      eq(schema.organizationMembers.userId, userId),
    ),
  });

  if (!orgMember) return "none";

  if (orgMember.role === "owner") return "owner";
  if (orgMember.role === "admin") return "admin";

  if (orgMember.customRoleId) {
    const customRole = await db.query.customRoles.findFirst({
      where: eq(schema.customRoles.id, orgMember.customRoleId),
    });

    if (customRole && customRole.permissions) {
      const perms = customRole.permissions as string[];
      if (perms.includes("org:admin")) return "admin";
    }
  }

  return "member";
}

export async function canAdminOrg(
  userId: string | undefined,
  organizationId: string,
  options?: PermissionOptions,
): Promise<boolean> {
  const permission = await getOrgPermission(userId, organizationId, options);
  return permission === "owner" || permission === "admin";
}

export async function canReadRepo(
  userId: string | undefined,
  repo: Repository,
  options?: PermissionOptions,
): Promise<boolean> {
  const permission = await getRepoPermission(userId, repo, options);
  if (permission === "none") return false;
  if (permission === "admin") return true;
  if (repo.visibility === "public") return true;

  // For private repos, check if user has at least read-level path permission
  if (!userId) return false;
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const anyPathPerm = await db.query.repositoryPathPermissions.findFirst({
    where: eq(schema.repositoryPathPermissions.repositoryId, repo.id),
    columns: { id: true },
  });
  if (!anyPathPerm) return true;
  return permission !== ("none" as PermissionLevel);
}

export async function canWriteRepo(
  userId: string | undefined,
  repo: Repository,
  options?: PermissionOptions,
): Promise<boolean> {
  const permission = await getRepoPermission(userId, repo, options);
  if (permission !== "write" && permission !== "admin") return false;
  // Fine-grained PAT enforcement: tokens restricted to repo:read cannot write
  return hasRepoWriteScope(options?.tokenScopes);
}

export async function canAdminRepo(
  userId: string | undefined,
  repo: Repository,
  options?: PermissionOptions,
): Promise<boolean> {
  const permission = await getRepoPermission(userId, repo, options);
  if (permission !== "admin") return false;
  // Admin-scoped PATs require the admin scope (or legacy full access)
  return hasPatScope(options?.tokenScopes, "admin");
}

/**
 * Check if a user can write to specific file paths in a repository.
 * Falls back to repo-level permission if no path restrictions exist.
 */
export async function canWriteRepoPaths(
  userId: string | undefined,
  repo: Repository,
  paths: string[],
  options?: PermissionOptions,
): Promise<boolean> {
  if (!userId) return false;
  const repoPermission = await getRepoPermission(userId, repo, options);
  if (repoPermission === "admin") return true;
  if (repoPermission !== "write") return false;

  // Check if path-level restrictions apply
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const pathPerms = await db.query.repositoryPathPermissions.findMany({
    where: eq(schema.repositoryPathPermissions.repositoryId, repo.id),
    columns: { pathPattern: true, permission: true, userId: true, teamId: true },
  });

  if (pathPerms.length === 0) {
    // No path restrictions — repo-level permission is sufficient
    return true;
  }

  // Get user's teams for team-based path permissions
  const userTeams = await db.query.teamMembers.findMany({
    where: eq(schema.teamMembers.userId, userId),
    columns: { teamId: true },
  });
  const userTeamIds = new Set(userTeams.map((t) => t.teamId));

  const { minimatch } = await import("minimatch");

  for (const path of paths) {
    let hasExplicitPermission = false;
    let isCovered = false;

    for (const perm of pathPerms) {
      if (!minimatch(path, perm.pathPattern)) continue;
      isCovered = true;

      const isUserMatch = perm.userId === userId;
      const isTeamMatch = perm.teamId && userTeamIds.has(perm.teamId);

      if (isUserMatch || isTeamMatch) {
        if (perm.permission === "write" || perm.permission === "admin") {
          hasExplicitPermission = true;
          break;
        }
      }
    }

    if (isCovered && !hasExplicitPermission) {
      return false;
    }
  }

  return true;
}
