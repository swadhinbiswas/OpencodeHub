/**
 * Package Registry Library
 * Supports npm and Docker/OCI registry protocols
 */

import { getDatabase, schema } from "@/db";
import type { Package, PackageVersion } from "@/db/schema/packages";
import { and, desc, eq, ilike, sql, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "./logger";

// ============================================================================
// PACKAGE CRUD
// ============================================================================

export type PackageType =
  | "npm"
  | "docker"
  | "maven"
  | "pypi"
  | "rubygems"
  | "nuget"
  | "generic";

export async function createPackage(options: {
  organizationId: string;
  repositoryId?: string;
  type: PackageType;
  name: string;
  description?: string;
  visibility?: "public" | "private";
  createdById: string;
}): Promise<Package> {
  const db = getDatabase();

  const pkg = {
    id: crypto.randomUUID(),
    organizationId: options.organizationId === "default" ? null : options.organizationId,
    repositoryId: options.repositoryId || null,
    type: options.type,
    name: options.name,
    description: options.description || null,
    visibility: options.visibility || "private",
    downloadCount: 0,
    createdById: options.createdById,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // @ts-expect-error - Drizzle multi-db union type issue
  await db.insert(schema.packages).values(pkg);

  logger.info(
    { packageId: pkg.id, name: options.name, type: options.type },
    "Package created",
  );
  return pkg as Package;
}

export async function getPackage(
  organizationId: string,
  type: PackageType,
  name: string,
): Promise<Package | undefined> {
  const db = getDatabase();
  const orgFilter =
    organizationId === "default"
      ? isNull(schema.packages.organizationId)
      : eq(schema.packages.organizationId, organizationId);
  return (await db.query.packages?.findFirst({
    where: and(
      orgFilter,
      eq(schema.packages.type, type),
      eq(schema.packages.name, name),
    ),
  })) as Package | undefined;
}

export async function listPackages(options: {
  organizationId: string;
  type?: PackageType;
  repositoryId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ packages: Package[]; total: number }> {
  const db = getDatabase();
  const conditions = [
    eq(schema.packages.organizationId, options.organizationId),
  ];

  if (options.type) {
    conditions.push(eq(schema.packages.type, options.type));
  }
  if (options.repositoryId) {
    conditions.push(eq(schema.packages.repositoryId, options.repositoryId));
  }
  if (options.search) {
    conditions.push(ilike(schema.packages.name, `%${options.search}%`));
  }

  const pkgs =
    (await db.query.packages?.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.packages.updatedAt)],
      limit: options.limit || 50,
      offset: options.offset || 0,
      with: {
        versions: {
          limit: 1,
          orderBy: (v: any, { desc }: any) => [desc(v.createdAt)],
        },
      },
    })) || [];

  // Count total
  const countResult = await (db as NodePgDatabase<typeof schema>)
    .select({ count: sql<number>`count(*)` })
    .from(schema.packages)
    .where(and(...conditions));
  const total = Number(countResult[0]?.count || 0);

  return { packages: pkgs as Package[], total };
}

export async function deletePackage(packageId: string): Promise<void> {
  const db = getDatabase();
  // @ts-expect-error - Drizzle multi-db union type issue
  await db.delete(schema.packages).where(eq(schema.packages.id, packageId));
  logger.info({ packageId }, "Package deleted");
}

// ============================================================================
// PACKAGE VERSIONS
// ============================================================================

export async function publishVersion(options: {
  packageId: string;
  version: string;
  digest: string;
  sizeBytes: number;
  storagePath: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  gitRef?: string;
  publishedById: string;
}): Promise<PackageVersion> {
  const db = getDatabase();

  const ver = {
    id: crypto.randomUUID(),
    packageId: options.packageId,
    version: options.version,
    digest: options.digest,
    sizeBytes: options.sizeBytes,
    storagePath: options.storagePath,
    metadata: options.metadata || null,
    tags: options.tags || ["latest"],
    gitRef: options.gitRef || null,
    publishedById: options.publishedById,
    downloadCount: 0,
    yanked: false,
    createdAt: new Date(),
  };

  await (db as NodePgDatabase<typeof schema>).insert(schema.packageVersions).values(ver);

  // Update package timestamp & handle "latest" tag demotion
  await (db as NodePgDatabase<typeof schema>)
    .update(schema.packages)
    .set({ updatedAt: new Date() })
    .where(eq(schema.packages.id, options.packageId));

  logger.info(
    { packageId: options.packageId, version: options.version },
    "Package version published",
  );

  return ver as PackageVersion;
}

export async function getVersion(
  packageId: string,
  version: string,
): Promise<PackageVersion | undefined> {
  const db = getDatabase();
  return (await db.query.packageVersions?.findFirst({
    where: and(
      eq(schema.packageVersions.packageId, packageId),
      eq(schema.packageVersions.version, version),
    ),
  })) as PackageVersion | undefined;
}

export async function listVersions(
  packageId: string,
  limit = 50,
): Promise<PackageVersion[]> {
  const db = getDatabase();
  return ((await db.query.packageVersions?.findMany({
    where: eq(schema.packageVersions.packageId, packageId),
    orderBy: [desc(schema.packageVersions.createdAt)],
    limit,
  })) || []) as PackageVersion[];
}

export async function yankVersion(
  packageId: string,
  version: string,
): Promise<void> {
  const db = getDatabase();
  await (db as NodePgDatabase<typeof schema>)
    .update(schema.packageVersions)
    .set({ yanked: true })
    .where(
      and(
        eq(schema.packageVersions.packageId, packageId),
        eq(schema.packageVersions.version, version),
      ),
    );
  logger.info({ packageId, version }, "Package version yanked");
}

export async function recordDownload(
  packageId: string,
  versionId: string,
): Promise<void> {
  const db = getDatabase();
  await (db as NodePgDatabase<typeof schema>)
    .update(schema.packageVersions)
    .set({ downloadCount: sql`${schema.packageVersions.downloadCount} + 1` })
    .where(eq(schema.packageVersions.id, versionId));
  await (db as NodePgDatabase<typeof schema>)
    .update(schema.packages)
    .set({ downloadCount: sql`${schema.packages.downloadCount} + 1` })
    .where(eq(schema.packages.id, packageId));
}

// ============================================================================
// NPM REGISTRY PROTOCOL
// ============================================================================

/**
 * Generate npm registry metadata for a package (GET /:package)
 */
export async function getNpmPackageMetadata(
  organizationId: string,
  packageName: string,
): Promise<Record<string, unknown> | null> {
  const pkg = await getPackage(organizationId, "npm", packageName);
  if (!pkg) return null;

  const versions = await listVersions(pkg.id, 500);

  const versionMap: Record<string, unknown> = {};
  const distTags: Record<string, string> = {};
  const times: Record<string, string> = {
    created: pkg.createdAt.toISOString(),
  };

  for (const ver of versions) {
    if (ver.yanked) continue;

    const meta = (ver.metadata || {}) as Record<string, unknown>;
    versionMap[ver.version] = {
      name: packageName,
      version: ver.version,
      description: pkg.description,
      dist: {
        tarball: `${process.env.SITE_URL || process.env.APP_URL || "http://localhost:4321"}/api/packages/npm/${packageName}/-/${packageName}-${ver.version}.tgz`,
        shasum: ver.digest,
        integrity: `sha256-${ver.digest}`,
      },
      ...meta,
    };

    times[ver.version] = ver.createdAt.toISOString();

    // Process tags
    const tags = (ver.tags || []) as string[];
    for (const tag of tags) {
      distTags[tag] = ver.version;
    }
  }

  return {
    _id: packageName,
    name: packageName,
    description: pkg.description,
    "dist-tags": distTags,
    versions: versionMap,
    time: times,
  };
}

// ============================================================================
// DOCKER/OCI REGISTRY PROTOCOL (v2)
// ============================================================================

/**
 * Check if a Docker blob exists (HEAD /v2/:name/blobs/:digest)
 */
export async function checkDockerBlobExists(
  organizationId: string,
  imageName: string,
  digest: string,
): Promise<{ exists: boolean; size?: number }> {
  const pkg = await getPackage(organizationId, "docker", imageName);
  if (!pkg) return { exists: false };

  const versions = await listVersions(pkg.id, 1000);
  for (const ver of versions) {
    if (ver.digest === digest) {
      return { exists: true, size: ver.sizeBytes || 0 };
    }
    // Check layer digests in metadata
    const meta = (ver.metadata || {}) as Record<string, unknown>;
    const layers = (meta.layers || []) as Array<{
      digest: string;
      size: number;
    }>;
    for (const layer of layers) {
      if (layer.digest === digest) {
        return { exists: true, size: layer.size };
      }
    }
  }

  return { exists: false };
}

/**
 * List Docker image tags (GET /v2/:name/tags/list)
 */
export async function listDockerTags(
  organizationId: string,
  imageName: string,
): Promise<{ name: string; tags: string[] } | null> {
  const pkg = await getPackage(organizationId, "docker", imageName);
  if (!pkg) return null;

  const versions = await listVersions(pkg.id, 1000);
  const tags = versions
    .filter((v) => !v.yanked)
    .flatMap((v) => {
      const vTags = (v.tags || []) as string[];
      return vTags.length > 0 ? vTags : [v.version];
    });

  return { name: imageName, tags: [...new Set(tags)] };
}

/**
 * Get Docker manifest (GET /v2/:name/manifests/:reference)
 */
export async function getDockerManifest(
  organizationId: string,
  imageName: string,
  reference: string,
): Promise<{ manifest: Record<string, unknown>; digest: string } | null> {
  const pkg = await getPackage(organizationId, "docker", imageName);
  if (!pkg) return null;

  const versions = await listVersions(pkg.id, 1000);

  // Find by tag or digest
  const ver = versions.find((v) => {
    if (v.version === reference || v.digest === reference) return true;
    const tags = (v.tags || []) as string[];
    return tags.includes(reference);
  });

  if (!ver) return null;

  const meta = (ver.metadata || {}) as Record<string, unknown>;
  const manifest = (meta.manifest || {
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: meta.config || {},
    layers: meta.layers || [],
  }) as Record<string, unknown>;

  return { manifest, digest: ver.digest || "" };
}

// ============================================================================
// PACKAGE STATS
// ============================================================================

export async function getPackageStats(organizationId: string): Promise<{
  totalPackages: number;
  totalVersions: number;
  totalDownloads: number;
  byType: Record<string, number>;
}> {
  const db = getDatabase();

  const pkgs =
    (await db.query.packages?.findMany({
      where: eq(schema.packages.organizationId, organizationId),
    })) || [];

  const byType: Record<string, number> = {};
  let totalVersions = 0;
  let totalDownloads = 0;

  for (const pkg of pkgs) {
    byType[pkg.type] = (byType[pkg.type] || 0) + 1;
    totalDownloads += pkg.downloadCount;

    const versions = await listVersions(pkg.id, 1000);
    totalVersions += versions.length;
  }

  return {
    totalPackages: pkgs.length,
    totalVersions,
    totalDownloads,
    byType,
  };
}
