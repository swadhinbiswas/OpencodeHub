import { getDatabase } from "@/db";
import type { Repository } from "@/db/schema";
import { repositoryCollaborators } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type PermissionLevel = "admin" | "write" | "read" | "none";

export async function getRepoPermission(
  userId: string | undefined,
  repo: Repository
): Promise<PermissionLevel> {
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

  const db = getDatabase();

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
  repo: Repository
): Promise<boolean> {
  const permission = await getRepoPermission(userId, repo);
  return permission !== "none";
}

export async function canWriteRepo(
  userId: string | undefined,
  repo: Repository
): Promise<boolean> {
  const permission = await getRepoPermission(userId, repo);
  return permission === "write" || permission === "admin";
}

export async function canAdminRepo(
  userId: string | undefined,
  repo: Repository
): Promise<boolean> {
  const permission = await getRepoPermission(userId, repo);
  return permission === "admin";
}
