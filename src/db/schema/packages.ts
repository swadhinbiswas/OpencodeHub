/**
 * Package Registry Schema
 * Supports npm, Docker/OCI, Maven, PyPI, RubyGems, NuGet package types
 */

import { relations } from "drizzle-orm";
import {
    boolean,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { repositories } from "./repositories";
import { users } from "./users";

// ============================================================================
// PACKAGES
// ============================================================================

export const packages = pgTable(
  "packages",
  {
    id: text("id").primaryKey(),
    /** Organization-scoped or user-scoped */
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    /** Link to a repository (optional — packages can be org-level) */
    repositoryId: text("repository_id").references(() => repositories.id, {
      onDelete: "set null",
    }),
    /** Package type: npm, docker, maven, pypi, rubygems, nuget, generic */
    type: text("type").notNull(),
    /** Scoped package name e.g. "@scope/name" or "my-image" */
    name: text("name").notNull(),
    /** Human-readable description */
    description: text("description"),
    /** Public or private */
    visibility: text("visibility").default("private").notNull(), // public, private
    /** Total downloads across all versions */
    downloadCount: integer("download_count").default(0).notNull(),
    /** Who published the first version */
    createdById: text("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueName: uniqueIndex("pkg_org_type_name_idx").on(
      table.organizationId,
      table.type,
      table.name,
    ),
    typeIdx: index("pkg_type_idx").on(table.type),
  }),
);

// ============================================================================
// PACKAGE VERSIONS
// ============================================================================

export const packageVersions = pgTable(
  "package_versions",
  {
    id: text("id").primaryKey(),
    packageId: text("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    /** Semantic version string */
    version: text("version").notNull(),
    /** Content digest / hash (sha256) */
    digest: text("digest"),
    /** Size in bytes */
    sizeBytes: integer("size_bytes"),
    /** Storage path/key in the storage adapter */
    storagePath: text("storage_path").notNull(),
    /** Package-type-specific metadata (e.g. npm package.json fields) */
    metadata: jsonb("metadata"),
    /** Tag labels: latest, next, beta, etc. */
    tags: jsonb("tags").$type<string[]>().default([]),
    /** Associated git tag or commit SHA */
    gitRef: text("git_ref"),
    /** Who published this version */
    publishedById: text("published_by_id").references(() => users.id),
    /** Download count for this specific version */
    downloadCount: integer("download_count").default(0).notNull(),
    /** Whether this version is yanked/deprecated */
    yanked: boolean("yanked").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueVersion: uniqueIndex("pkg_version_idx").on(
      table.packageId,
      table.version,
    ),
    digestIdx: index("pkg_digest_idx").on(table.digest),
  }),
);

// ============================================================================
// RELATIONS
// ============================================================================

export const packagesRelations = relations(packages, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [packages.organizationId],
    references: [organizations.id],
  }),
  repository: one(repositories, {
    fields: [packages.repositoryId],
    references: [repositories.id],
  }),
  createdBy: one(users, {
    fields: [packages.createdById],
    references: [users.id],
  }),
  versions: many(packageVersions),
}));

export const packageVersionsRelations = relations(
  packageVersions,
  ({ one }) => ({
    package: one(packages, {
      fields: [packageVersions.packageId],
      references: [packages.id],
    }),
    publishedBy: one(users, {
      fields: [packageVersions.publishedById],
      references: [users.id],
    }),
  }),
);

// ============================================================================
// TYPES
// ============================================================================

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
export type PackageVersion = typeof packageVersions.$inferSelect;
export type NewPackageVersion = typeof packageVersions.$inferInsert;
