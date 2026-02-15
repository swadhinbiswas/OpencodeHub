import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Repository } from "@/db/schema";
import { repositoryCollaborators, organizationMembers, customRoles } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type PermissionLevel = "admin" | "write" | "read" | "none";
export type OrgPermissionLevel = "owner" | "admin" | "member" | "none";

export interface PermissionOptions {
  /** If true, the user is a site-wide admin with full access to all repositories */
  isAdmin?: boolean;
}

export async function getRepoPermission(
  userId: string | undefined,
  repo: Repository,
  options?: PermissionOptions
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
      eq(repositoryCollaborators.userId, userId)
    ),
  });

  if (!collaborator) {
    // Check Organization Membership if repo is owned by an org
    if (repo.ownerType === "organization") {
      const orgMember = await db.query.organizationMembers.findFirst({
        where: and(
          eq(schema.organizationMembers.organizationId, repo.ownerId),
          eq(schema.organizationMembers.userId, userId)
        ),
        with: {
          // @ts-ignore - relation added in index.ts/roles.ts but might not be visible in types yet without generation
          // Actually we need to query customRole manually or rely on properly set up relations
        }
      });

      if (orgMember) {
        if (orgMember.role === "owner" || orgMember.role === "admin") {
          return "admin";
        }

        if (orgMember.customRoleId) {
          const customRole = await db.query.customRoles.findFirst({
            where: eq(schema.customRoles.id, orgMember.customRoleId)
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
  options?: PermissionOptions
): Promise<OrgPermissionLevel> {
  if (options?.isAdmin) {
    return "admin";
  }

  if (!userId) return "none";

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const orgMember = await db.query.organizationMembers.findFirst({
    where: and(
      eq(schema.organizationMembers.organizationId, organizationId),
      eq(schema.organizationMembers.userId, userId)
    ),
  });

  if (!orgMember) return "none";

  if (orgMember.role === "owner") return "owner";
  if (orgMember.role === "admin") return "admin";

  if (orgMember.customRoleId) {
    const customRole = await db.query.customRoles.findFirst({
      where: eq(schema.customRoles.id, orgMember.customRoleId)
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
  options?: PermissionOptions
): Promise<boolean> {
  const permission = await getOrgPermission(userId, organizationId, options);
  return permission === "owner" || permission === "admin";
}

export async function canReadRepo(
  userId: string | undefined,
  repo: Repository,
  options?: PermissionOptions
): Promise<boolean> {
  const permission = await getRepoPermission(userId, repo, options);
  return permission !== "none";
}

export async function canWriteRepo(
  userId: string | undefined,
  repo: Repository,
  options?: PermissionOptions
): Promise<boolean> {
  const permission = await getRepoPermission(userId, repo, options);
  return permission === "write" || permission === "admin";
}

export async function canAdminRepo(
  userId: string | undefined,
  repo: Repository,
  options?: PermissionOptions
): Promise<boolean> {
  const permission = await getRepoPermission(userId, repo, options);
  return permission === "admin";
}
