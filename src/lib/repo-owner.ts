/**
 * Org-aware repository owner resolution.
 *
 * Repositories may be owned by a user (ownerType='user') or an
 * organization (ownerType='organization', ownerId = org id). Many routes
 * look up owners via the users table only, which 404s every org-owned
 * repo. Use `resolveOwnerRepo` instead of the naive lookup.
 */
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export async function resolveOwnerRepo(
  ownerName: string,
  repoName: string,
): Promise<{ repository: any; ownerType: "user" | "organization" } | null> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (ownerUser) {
    const repository = await db.query.repositories.findFirst({
      where: and(
        eq(schema.repositories.ownerId, ownerUser.id),
        eq(schema.repositories.name, repoName),
      ),
    });
    if (repository) return { repository, ownerType: "user" };
  }

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, ownerName),
  });
  if (org) {
    const repository = await db.query.repositories.findFirst({
      where: and(
        eq(schema.repositories.ownerId, org.id),
        eq(schema.repositories.ownerType, "organization"),
        eq(schema.repositories.name, repoName),
      ),
    });
    if (repository) return { repository, ownerType: "organization" };
  }

  return null;
}
