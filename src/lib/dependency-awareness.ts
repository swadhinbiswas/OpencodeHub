/**
 * Dependency & Impact Awareness Library
 * Cross-repo change sets, breaking change detection, migration detection, API awareness
 */

import { pgTable, text, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";
import { pullRequests } from "@/db/schema/pull-requests";

// ============================================================================
// SCHEMA
// ============================================================================

export const changeSets = pgTable("change_sets", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    createdById: text("created_by_id").notNull(),
    status: text("status").default("draft"), // draft, ready, merged, abandoned
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const changeSetItems = pgTable("change_set_items", {
    id: text("id").primaryKey(),
    changeSetId: text("change_set_id")
        .notNull()
        .references(() => changeSets.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id"),
    order: integer("order").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const breakingChanges = pgTable("breaking_changes", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    changeType: text("change_type").notNull(), // api, schema, config, dependency
    severity: text("severity").notNull(), // low, medium, high, critical
    description: text("description").notNull(),
    affectedFiles: jsonb("affected_files").$type<string[]>(),
    suggestedAction: text("suggested_action"),
    acknowledged: boolean("acknowledged").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const migrationDetections = pgTable("migration_detections", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    migrationType: text("migration_type").notNull(), // database, config, api, schema
    tool: text("tool"), // prisma, drizzle, alembic, flyway, liquibase
    files: jsonb("files").$type<string[]>(),
    isReversible: boolean("is_reversible"),
    requiresDowntime: boolean("requires_downtime"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ChangeSet = typeof changeSets.$inferSelect;
export type BreakingChange = typeof breakingChanges.$inferSelect;
export type MigrationDetection = typeof migrationDetections.$inferSelect;

// ============================================================================
// CROSS-REPO CHANGE SETS
// ============================================================================

export async function createChangeSet(options: {
    name: string;
    description?: string;
    createdById: string;
    repositories: { repositoryId: string; pullRequestId?: string }[];
}): Promise<ChangeSet> {
    const db = getDatabase();

    const changeSet = {
        id: crypto.randomUUID(),
        name: options.name,
        description: options.description || null,
        createdById: options.createdById,
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.changeSets).values(changeSet);

    // Add items
    for (let i = 0; i < options.repositories.length; i++) {
        const repo = options.repositories[i];
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.changeSetItems).values({
            id: crypto.randomUUID(),
            changeSetId: changeSet.id,
            repositoryId: repo.repositoryId,
            pullRequestId: repo.pullRequestId || null,
            order: i,
            createdAt: new Date(),
        });
    }

    logger.info({ changeSetId: changeSet.id }, "Change set created");

    return changeSet as ChangeSet;
}

export async function getChangeSetWithItems(changeSetId: string): Promise<{
    changeSet: ChangeSet;
    items: { repository: unknown; pullRequest?: unknown }[];
} | null> {
    const db = getDatabase();

    const changeSet = await db.query.changeSets?.findFirst({
        where: eq(schema.changeSets.id, changeSetId),
    });

    if (!changeSet) return null;

    const items = await db.query.changeSetItems?.findMany({
        where: eq(schema.changeSetItems.changeSetId, changeSetId),
    }) || [];

    const enrichedItems = [];
    for (const item of items) {
        const repository = await db.query.repositories.findFirst({
            where: eq(schema.repositories.id, item.repositoryId),
        });
        const pullRequest = item.pullRequestId
            ? await db.query.pullRequests.findFirst({
                where: eq(schema.pullRequests.id, item.pullRequestId),
            })
            : undefined;

        enrichedItems.push({ repository, pullRequest });
    }

    return { changeSet, items: enrichedItems };
}

// ============================================================================
// BREAKING CHANGE DETECTION
// ============================================================================

export async function detectBreakingChanges(pullRequestId: string): Promise<BreakingChange[]> {
    const db = getDatabase();
    const detectedChanges: BreakingChange[] = [];

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, pullRequestId),
    });

    if (!pr) return detectedChanges;

    // Analyze diff for breaking changes
    const patterns = [
        {
            pattern: /^-\s*export\s+(function|const|class|interface|type)\s+(\w+)/gm,
            type: "api",
            severity: "high",
            template: "Removed export: $2",
        },
        {
            pattern: /^-\s*(public|protected)\s+\w+\s*\(/gm,
            type: "api",
            severity: "medium",
            template: "Removed public method",
        },
        {
            pattern: /\.drop(Table|Column|Index)\s*\(/gi,
            type: "schema",
            severity: "critical",
            template: "Database schema drop detected",
        },
        {
            pattern: /ALTER\s+TABLE.*DROP\s+COLUMN/gi,
            type: "schema",
            severity: "critical",
            template: "Column drop detected",
        },
        {
            pattern: /"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"/g,
            type: "dependency",
            severity: "medium",
            template: "Major version change in dependencies",
        },
        {
            pattern: /^-\s*"[^"]+"\s*:\s*"[\^~]?\d+/gm,
            type: "dependency",
            severity: "low",
            template: "Dependency removed",
        },
    ];

    // Simulated diff analysis
    const diff = ""; // Would be fetched from Git

    for (const { pattern, type, severity, template } of patterns) {
        const matches = diff.matchAll(pattern);
        for (const match of matches) {
            const change = {
                id: crypto.randomUUID(),
                pullRequestId,
                changeType: type,
                severity,
                description: template.replace("$2", match[2] || ""),
                affectedFiles: [],
                suggestedAction: getSuggestedAction(type, severity),
                acknowledged: false,
                createdAt: new Date(),
            };

            // @ts-expect-error - Drizzle multi-db union type issue
            await db.insert(schema.breakingChanges).values(change);
            detectedChanges.push(change as BreakingChange);
        }
    }

    return detectedChanges;
}

function getSuggestedAction(type: string, severity: string): string {
    const actions: Record<string, Record<string, string>> = {
        api: {
            critical: "Add deprecation notice and maintain backward compatibility",
            high: "Document breaking change in changelog",
            medium: "Consider adding compatibility layer",
            low: "Update API documentation",
        },
        schema: {
            critical: "Create reversible migration, test with production data backup",
            high: "Schedule migration during maintenance window",
            medium: "Add migration rollback procedure",
            low: "Document schema change",
        },
        dependency: {
            critical: "Pin to specific version, test thoroughly",
            high: "Review changelog for breaking changes",
            medium: "Run full test suite",
            low: "Update lock file",
        },
    };

    return actions[type]?.[severity] || "Review change carefully";
}

// ============================================================================
// DATABASE MIGRATION DETECTION
// ============================================================================

export async function detectMigrations(pullRequestId: string, changedFiles: string[]): Promise<MigrationDetection[]> {
    const db = getDatabase();
    const detections: MigrationDetection[] = [];

    const migrationPatterns = [
        { pattern: /migrations?\/.*\.(sql|ts|js)$/i, tool: "generic", type: "database" },
        { pattern: /prisma\/migrations\//i, tool: "prisma", type: "database" },
        { pattern: /drizzle\/.*\.sql$/i, tool: "drizzle", type: "database" },
        { pattern: /alembic\/versions\//i, tool: "alembic", type: "database" },
        { pattern: /flyway\/.*V\d+/i, tool: "flyway", type: "database" },
        { pattern: /liquibase.*changelog/i, tool: "liquibase", type: "database" },
        { pattern: /\.env(\.(local|production|staging))?$/i, tool: null, type: "config" },
        { pattern: /openapi\.(yaml|json)$/i, tool: null, type: "api" },
        { pattern: /schema\.(graphql|gql)$/i, tool: null, type: "schema" },
    ];

    const matchedFiles: Record<string, { tool: string | null; type: string; files: string[] }> = {};

    for (const file of changedFiles) {
        for (const { pattern, tool, type } of migrationPatterns) {
            if (pattern.test(file)) {
                const key = `${type}-${tool || "generic"}`;
                if (!matchedFiles[key]) {
                    matchedFiles[key] = { tool, type, files: [] };
                }
                matchedFiles[key].files.push(file);
            }
        }
    }

    for (const [, { tool, type, files }] of Object.entries(matchedFiles)) {
        const detection = {
            id: crypto.randomUUID(),
            pullRequestId,
            migrationType: type,
            tool,
            files,
            isReversible: await checkMigrationReversibility(files),
            requiresDowntime: type === "database" && files.some(f => /drop|alter/i.test(f)),
            notes: null,
            createdAt: new Date(),
        };

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.migrationDetections).values(detection);
        detections.push(detection as MigrationDetection);
    }

    return detections;
}

async function checkMigrationReversibility(files: string[]): Promise<boolean> {
    // Check for down migrations
    return files.some(f => /down|rollback|revert/i.test(f));
}

// ============================================================================
// API CHANGE AWARENESS
// ============================================================================

export interface APIChange {
    type: "added" | "removed" | "modified";
    path: string;
    method?: string;
    breaking: boolean;
    details: string;
}

export async function detectAPIChanges(
    pullRequestId: string,
    oldSpec: Record<string, unknown>,
    newSpec: Record<string, unknown>
): Promise<APIChange[]> {
    const changes: APIChange[] = [];

    const oldPaths = (oldSpec.paths || {}) as Record<string, unknown>;
    const newPaths = (newSpec.paths || {}) as Record<string, unknown>;

    // Detect removed endpoints (breaking)
    for (const path of Object.keys(oldPaths)) {
        if (!newPaths[path]) {
            changes.push({
                type: "removed",
                path,
                breaking: true,
                details: `Endpoint ${path} was removed`,
            });
        }
    }

    // Detect added endpoints (non-breaking)
    for (const path of Object.keys(newPaths)) {
        if (!oldPaths[path]) {
            changes.push({
                type: "added",
                path,
                breaking: false,
                details: `New endpoint ${path} added`,
            });
        }
    }

    // Detect modified endpoints
    for (const path of Object.keys(newPaths)) {
        if (oldPaths[path]) {
            const oldMethods = Object.keys(oldPaths[path] as object);
            const newMethods = Object.keys(newPaths[path] as object);

            // Check for removed methods (breaking)
            for (const method of oldMethods) {
                if (!newMethods.includes(method)) {
                    changes.push({
                        type: "removed",
                        path,
                        method: method.toUpperCase(),
                        breaking: true,
                        details: `${method.toUpperCase()} method removed from ${path}`,
                    });
                }
            }

            // Check for added methods (non-breaking)
            for (const method of newMethods) {
                if (!oldMethods.includes(method)) {
                    changes.push({
                        type: "added",
                        path,
                        method: method.toUpperCase(),
                        breaking: false,
                        details: `${method.toUpperCase()} method added to ${path}`,
                    });
                }
            }
        }
    }

    // Store breaking changes
    const db = getDatabase();
    for (const change of changes.filter(c => c.breaking)) {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.breakingChanges).values({
            id: crypto.randomUUID(),
            pullRequestId,
            changeType: "api",
            severity: change.type === "removed" ? "high" : "medium",
            description: change.details,
            affectedFiles: [],
            suggestedAction: "Update API consumers before merging",
            acknowledged: false,
            createdAt: new Date(),
        });
    }

    return changes;
}

// ============================================================================
// IMPACT ANALYSIS
// ============================================================================

export async function analyzeImpact(pullRequestId: string): Promise<{
    breakingChanges: BreakingChange[];
    migrations: MigrationDetection[];
    affectedRepos: string[];
    riskScore: number;
}> {
    const db = getDatabase();

    const breakingChanges = await db.query.breakingChanges?.findMany({
        where: eq(schema.breakingChanges.pullRequestId, pullRequestId),
    }) || [];

    const migrations = await db.query.migrationDetections?.findMany({
        where: eq(schema.migrationDetections.pullRequestId, pullRequestId),
    }) || [];

    // Find affected repositories through cross-repo links
    const crossLinks = await db.query.crossRepoIssueLinks?.findMany({}) || [];
    const affectedRepos: string[] = [];

    // Calculate risk score (0-100)
    let riskScore = 0;
    const severityScores: Record<string, number> = {
        critical: 30,
        high: 20,
        medium: 10,
        low: 5,
    };

    for (const bc of breakingChanges) {
        riskScore += severityScores[bc.severity] || 5;
    }

    for (const migration of migrations) {
        if (migration.requiresDowntime) riskScore += 25;
        if (!migration.isReversible) riskScore += 15;
        else riskScore += 5;
    }

    riskScore = Math.min(100, riskScore);

    return { breakingChanges, migrations, affectedRepos, riskScore };
}

// ============================================================================
// MONOREPO PACKAGE DEPENDENCY GRAPH
// ============================================================================

export interface PackageNode {
    name: string;
    path: string;
    version: string;
    dependencies: string[];
    devDependencies: string[];
    type: "app" | "package" | "library" | "service";
}

export interface DependencyGraph {
    packages: PackageNode[];
    edges: { from: string; to: string; type: "runtime" | "dev" }[];
    cycles: string[][];
}

export async function buildMonorepoDependencyGraph(repositoryId: string): Promise<DependencyGraph> {
    const db = getDatabase();
    const packages: PackageNode[] = [];
    const edges: { from: string; to: string; type: "runtime" | "dev" }[] = [];

    // In production, scan filesystem for package.json files
    // Simulated package discovery
    const packagePaths = [
        "packages/core",
        "packages/ui",
        "packages/api",
        "apps/web",
        "apps/mobile",
    ];

    for (const pkgPath of packagePaths) {
        // Would read package.json from Git
        const pkg: PackageNode = {
            name: pkgPath.split("/").pop() || "",
            path: pkgPath,
            version: "1.0.0",
            dependencies: [],
            devDependencies: [],
            type: pkgPath.startsWith("apps/") ? "app" : "package",
        };

        packages.push(pkg);
    }

    // Build edges from internal dependencies
    for (const pkg of packages) {
        for (const dep of pkg.dependencies) {
            const target = packages.find(p => p.name === dep);
            if (target) {
                edges.push({ from: pkg.name, to: target.name, type: "runtime" });
            }
        }
        for (const dep of pkg.devDependencies) {
            const target = packages.find(p => p.name === dep);
            if (target) {
                edges.push({ from: pkg.name, to: target.name, type: "dev" });
            }
        }
    }

    // Detect cycles using DFS
    const cycles = detectCycles(packages, edges);

    return { packages, edges, cycles };
}

function detectCycles(packages: PackageNode[], edges: { from: string; to: string }[]): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
        if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
        adjacency.get(edge.from)!.push(edge.to);
    }

    function dfs(node: string): boolean {
        visited.add(node);
        recStack.add(node);
        path.push(node);

        for (const neighbor of adjacency.get(node) || []) {
            if (!visited.has(neighbor)) {
                if (dfs(neighbor)) return true;
            } else if (recStack.has(neighbor)) {
                const cycleStart = path.indexOf(neighbor);
                cycles.push(path.slice(cycleStart));
                return true;
            }
        }

        path.pop();
        recStack.delete(node);
        return false;
    }

    for (const pkg of packages) {
        if (!visited.has(pkg.name)) {
            dfs(pkg.name);
        }
    }

    return cycles;
}

export async function getAffectedPackages(
    repositoryId: string,
    changedPackages: string[]
): Promise<string[]> {
    const graph = await buildMonorepoDependencyGraph(repositoryId);
    const affected = new Set<string>(changedPackages);

    // Find all packages that depend on changed packages (reverse dependencies)
    let foundNew = true;
    while (foundNew) {
        foundNew = false;
        for (const edge of graph.edges) {
            if (affected.has(edge.to) && !affected.has(edge.from)) {
                affected.add(edge.from);
                foundNew = true;
            }
        }
    }

    return Array.from(affected);
}

export async function suggestBuildOrder(repositoryId: string): Promise<string[]> {
    const graph = await buildMonorepoDependencyGraph(repositoryId);

    // Topological sort for build order
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const pkg of graph.packages) {
        inDegree.set(pkg.name, 0);
        adjacency.set(pkg.name, []);
    }

    for (const edge of graph.edges) {
        if (edge.type === "runtime") { // Only runtime deps affect build order
            adjacency.get(edge.from)!.push(edge.to);
            inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
        }
    }

    const queue: string[] = [];
    for (const [pkg, degree] of inDegree) {
        if (degree === 0) queue.push(pkg);
    }

    const order: string[] = [];
    while (queue.length > 0) {
        const pkg = queue.shift()!;
        order.push(pkg);

        for (const dep of adjacency.get(pkg) || []) {
            inDegree.set(dep, inDegree.get(dep)! - 1);
            if (inDegree.get(dep) === 0) queue.push(dep);
        }
    }

    return order.reverse(); // Dependencies first
}
