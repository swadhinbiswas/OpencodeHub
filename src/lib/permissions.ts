import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Repository } from "@/db/schema";
import { repositoryCollaborators } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type PermissionLevel = "admin" | "write" | "read" | "none";

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
