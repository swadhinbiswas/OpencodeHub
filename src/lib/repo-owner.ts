/**
 * Org-aware repository owner resolution.
 *
 * Repositories may be owned by a user (ownerType='user') or an
 * organization (ownerType='organization', ownerId = org id). Many routes
 * look up owners via the users table only, which 404s every org-owned
 * repo. Use `resolveOwnerRepo` instead of the naive lookup.
 */
import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
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

/**
 * Fill in a synthetic `owner.username` for org-owned repos.
 * Queries that use `with: { owner: true }` get a null owner for org repos
 * org repos.
 */
export async function resolveOrgOwners<T>(items: T[]): Promise<T[]> {
  const candidates: any[] = [];
  const walk = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    if (obj.ownerType === "organization" && !obj.owner && obj.ownerId) {
      candidates.push(obj);
    }
    if (
      obj.repository &&
      obj.repository.ownerType === "organization" &&
      !obj.repository.owner &&
      obj.repository.ownerId
    ) {
      candidates.push(obj.repository);
    }
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (Array.isArray(value)) value.forEach(walk);
    }
  };
  items.forEach(walk);
  if (candidates.length === 0) return items;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const orgs = await db.query.organizations.findMany({
    where: inArray(schema.organizations.id, candidates.map((c) => c.ownerId)),
    columns: { id: true, name: true },
  });
  const nameById = new Map(orgs.map((o) => [o.id, o.name]));
  for (const c of candidates) {
    c.owner = { username: nameById.get(c.ownerId) ?? "org" };
  }
  return items;
}
