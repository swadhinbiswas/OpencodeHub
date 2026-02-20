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
import crypto from "node:crypto";
import { getChangedFiles, getGit } from "./git";
import { resolveRepoPath } from "./git-storage";

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

export const apiChangeDetections = pgTable("api_change_detections", {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
        .notNull()
        .references(() => pullRequests.id, { onDelete: "cascade" }),
    changeType: text("change_type").notNull(), // added, removed, modified
    path: text("path").notNull(),
    method: text("method"),
    breaking: boolean("breaking").default(false),
    details: text("details").notNull(),
    affectedFiles: jsonb("affected_files").$type<string[]>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ChangeSet = typeof changeSets.$inferSelect;
export type BreakingChange = typeof breakingChanges.$inferSelect;
export type MigrationDetection = typeof migrationDetections.$inferSelect;
export type APIChangeDetection = typeof apiChangeDetections.$inferSelect;

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

    const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, pr.repositoryId),
    });
    if (!repository) return detectedChanges;

    const repoPath = await resolveRepoPath(repository.diskPath);
    const changedFiles = await getChangedFiles(repoPath, pr.baseBranch, pr.headBranch);
    const git = getGit(repoPath);
    const diff = await git.raw(["diff", `${pr.baseBranch}...${pr.headBranch}`]);

    // Clear previous detections for idempotent re-runs.
    // @ts-expect-error - Drizzle multi-db union type issue
    await db.delete(schema.breakingChanges).where(eq(schema.breakingChanges.pullRequestId, pullRequestId));

    const fileRules = [
        {
            match: (f: string) => /openapi\.(ya?ml|json)$/i.test(f) || /schema\.(graphql|gql)$/i.test(f),
            type: "api",
            severity: "high",
            description: "API contract file changed",
        },
        {
            match: (f: string) => /migrations?\/.*\.(sql|ts|js)$/i.test(f),
            type: "schema",
            severity: "medium",
            description: "Migration file changed",
        },
        {
            match: (f: string) => /package\.json$|pnpm-lock\.yaml$|yarn\.lock$|package-lock\.json$/i.test(f),
            type: "dependency",
            severity: "medium",
            description: "Dependency manifest changed",
        },
    ];

    const sourceFiles = changedFiles.filter((file) =>
        /\.(ts|tsx|js|jsx|mjs|cjs|go|java|kt|py|rb|rs|cs|php)$/i.test(file)
    );
    const removedExportPattern = /^-\s*export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z0-9_]+)/gm;
    const removedPublicMethodPattern = /^-\s*(?:public|protected)\s+[A-Za-z0-9_]+\s*\(/gm;
    const schemaDropPattern = /\.drop(Table|Column|Index)\s*\(/gi;
    const sqlDestructivePattern = /\b(?:DROP\s+(?:TABLE|COLUMN|INDEX)|ALTER\s+TABLE.+DROP\s+COLUMN)\b/gi;
    const dependencyRemovalPattern = /^-\s*"([^"]+)"\s*:\s*"([^"]+)"/gm;

    const seen = new Set<string>();

    const insertBreakingChange = async (change: {
        changeType: string;
        severity: string;
        description: string;
        affectedFiles: string[];
    }) => {
        const key = `${change.changeType}:${change.severity}:${change.description}:${change.affectedFiles.sort().join(",")}`;
        if (seen.has(key)) return;
        seen.add(key);

        const row = {
            id: crypto.randomUUID(),
            pullRequestId,
            changeType: change.changeType,
            severity: change.severity,
            description: change.description,
            affectedFiles: change.affectedFiles,
            suggestedAction: getSuggestedAction(change.changeType, change.severity),
            acknowledged: false,
            createdAt: new Date(),
        };

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.breakingChanges).values(row);
        detectedChanges.push(row as BreakingChange);
    };

    if (sourceFiles.length > 0) {
        for (const match of diff.matchAll(removedExportPattern)) {
            await insertBreakingChange({
                changeType: "api",
                severity: "high",
                description: `Removed exported symbol: ${match[1]}`,
                affectedFiles: sourceFiles.slice(0, 10),
            });
        }

        if (removedPublicMethodPattern.test(diff)) {
            await insertBreakingChange({
                changeType: "api",
                severity: "medium",
                description: "Removed public/protected method signature",
                affectedFiles: sourceFiles.slice(0, 10),
            });
        }
    }

    if (schemaDropPattern.test(diff) || sqlDestructivePattern.test(diff)) {
        await insertBreakingChange({
            changeType: "schema",
            severity: "critical",
            description: "Destructive schema operation detected in diff",
            affectedFiles: changedFiles.filter((f) => /migrations?|schema|sql|drizzle|prisma/i.test(f)).slice(0, 10),
        });
    }

    const removedDependencies = Array.from(diff.matchAll(dependencyRemovalPattern))
        .map((match) => ({ name: match[1], version: match[2] }))
        .filter((dep) => !dep.name.startsWith("@types/"));
    if (removedDependencies.length > 0) {
        await insertBreakingChange({
            changeType: "dependency",
            severity: "medium",
            description: `Dependency removals detected (${removedDependencies.length})`,
            affectedFiles: changedFiles.filter((f) => /package\.json$|pnpm-lock\.yaml$|yarn\.lock$|package-lock\.json$/i.test(f)),
        });
    }

    for (const file of changedFiles) {
        for (const rule of fileRules) {
            if (!rule.match(file)) continue;
            await insertBreakingChange({
                changeType: rule.type,
                severity: rule.severity,
                description: `${rule.description}: ${file}`,
                affectedFiles: [file],
            });
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
    // @ts-expect-error - Drizzle multi-db union type issue
    await db.delete(schema.migrationDetections).where(eq(schema.migrationDetections.pullRequestId, pullRequestId));

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

    let pr: typeof schema.pullRequests.$inferSelect | undefined;
    let repository: typeof schema.repositories.$inferSelect | undefined;
    let git: ReturnType<typeof getGit> | null = null;
    if (Object.keys(matchedFiles).length > 0) {
        pr = await db.query.pullRequests.findFirst({
            where: eq(schema.pullRequests.id, pullRequestId),
        });
        if (pr) {
            repository = await db.query.repositories.findFirst({
                where: eq(schema.repositories.id, pr.repositoryId),
            }) || undefined;
        }
        if (repository) {
            const repoPath = await resolveRepoPath(repository.diskPath);
            git = getGit(repoPath);
        }
    }

    for (const [, { tool, type, files }] of Object.entries(matchedFiles)) {
        const analyzed = await analyzeMigrationFiles({
            git,
            baseRef: pr?.baseBranch,
            headRef: pr?.headBranch,
            files,
        });
        const detection = {
            id: crypto.randomUUID(),
            pullRequestId,
            migrationType: type,
            tool,
            files,
            isReversible: analyzed.isReversible,
            requiresDowntime: analyzed.requiresDowntime,
            notes: analyzed.notes,
            createdAt: new Date(),
        };

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.migrationDetections).values(detection);
        detections.push(detection as MigrationDetection);
    }

    return detections;
}

async function analyzeMigrationFiles(options: {
    git: ReturnType<typeof getGit> | null;
    baseRef?: string;
    headRef?: string;
    files: string[];
}): Promise<{ isReversible: boolean; requiresDowntime: boolean; notes: string | null }> {
    const downFileHint = options.files.some((f) => /down|rollback|revert/i.test(f));
    let reversibleSignals = downFileHint ? 1 : 0;
    let downtimeSignals = 0;
    const noteParts: string[] = [];

    for (const file of options.files) {
        const headContent = await getFileContentAtRef(options.git, options.headRef, file);
        const baseContent = await getFileContentAtRef(options.git, options.baseRef, file);
        const combined = `${baseContent || ""}\n${headContent || ""}`.toLowerCase();

        if (/\b(drop\s+table|drop\s+column|alter\s+table.+drop\s+column)\b/.test(combined)) {
            downtimeSignals += 2;
            noteParts.push(`destructive sql in ${file}`);
        }
        if (/\b(rename\s+column|alter\s+type|drop\s+constraint)\b/.test(combined)) {
            downtimeSignals += 1;
            noteParts.push(`schema transition in ${file}`);
        }
        if (/\b(down|rollback|revert|undo)\b/.test(combined)) {
            reversibleSignals += 1;
        }
        if (/\b(create\s+table|add\s+column)\b/.test(combined)) {
            noteParts.push(`additive migration in ${file}`);
        }
    }

    return {
        isReversible: reversibleSignals > 0,
        requiresDowntime: downtimeSignals >= 2,
        notes: noteParts.length > 0 ? Array.from(new Set(noteParts)).join("; ") : null,
    };
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
    sourceFile?: string;
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

    await persistAPIChanges(pullRequestId, changes, []);

    return changes;
}

export async function detectAPIChangesForPullRequest(
    pullRequestId: string,
    changedFiles: string[]
): Promise<APIChange[]> {
    const db = getDatabase();
    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, pullRequestId),
    });
    if (!pr) return [];

    const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, pr.repositoryId),
    });
    if (!repository) return [];

    const apiSpecFiles = changedFiles.filter((file) =>
        /openapi\.(ya?ml|json)$|swagger\.(ya?ml|json)$|schema\.(graphql|gql)$|\.proto$/i.test(file)
    );
    if (apiSpecFiles.length === 0) {
        await persistAPIChanges(pullRequestId, [], []);
        return [];
    }

    const repoPath = await resolveRepoPath(repository.diskPath);
    const git = getGit(repoPath);
    const changes: APIChange[] = [];

    for (const file of apiSpecFiles) {
        const oldContent = await getFileContentAtRef(git, pr.baseBranch, file);
        const newContent = await getFileContentAtRef(git, pr.headBranch, file);
        const fileChanges = detectAPIChangesFromText(oldContent || "", newContent || "", file);
        changes.push(...fileChanges);
    }

    await persistAPIChanges(pullRequestId, changes, apiSpecFiles);
    return changes;
}

async function persistAPIChanges(
    pullRequestId: string,
    changes: APIChange[],
    sourceFiles: string[]
) {
    const db = getDatabase();

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.delete(schema.apiChangeDetections).where(eq(schema.apiChangeDetections.pullRequestId, pullRequestId));

    for (const change of changes) {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.apiChangeDetections).values({
            id: crypto.randomUUID(),
            pullRequestId,
            changeType: change.type,
            path: change.path,
            method: change.method || null,
            breaking: change.breaking,
            details: change.details,
            affectedFiles: change.sourceFile ? [change.sourceFile] : sourceFiles,
            createdAt: new Date(),
        });

        if (change.breaking) {
            // @ts-expect-error - Drizzle multi-db union type issue
            await db.insert(schema.breakingChanges).values({
                id: crypto.randomUUID(),
                pullRequestId,
                changeType: "api",
                severity: change.type === "removed" ? "high" : "medium",
                description: change.details,
                affectedFiles: change.sourceFile ? [change.sourceFile] : sourceFiles,
                suggestedAction: "Update API consumers before merging",
                acknowledged: false,
                createdAt: new Date(),
            });
        }
    }
}

function detectAPIChangesFromText(oldContent: string, newContent: string, sourceFile: string): APIChange[] {
    const changes: APIChange[] = [];
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");

    const parseOpenApiSignals = (lines: string[]) => {
        const endpoints = new Set<string>();
        for (const raw of lines) {
            const line = raw.trim();
            const pathMatch = /^\/[A-Za-z0-9_{}\-./]+:\s*$/.exec(line);
            if (pathMatch) endpoints.add(pathMatch[0].replace(/:\s*$/, ""));
        }
        return { endpoints };
    };

    const parseGraphqlSignals = (lines: string[]) => {
        const defs = new Set<string>();
        for (const raw of lines) {
            const line = raw.trim();
            const typeMatch = /^(type|interface|enum|input)\s+([A-Za-z0-9_]+)/.exec(line);
            if (typeMatch) defs.add(`${typeMatch[1]}:${typeMatch[2]}`);
            const fieldMatch = /^([A-Za-z0-9_]+)\s*\([^)]*\)?\s*:\s*([A-Za-z0-9_[\]!]+)/.exec(line);
            if (fieldMatch) defs.add(`field:${fieldMatch[1]}:${fieldMatch[2]}`);
        }
        return defs;
    };

    if (/openapi|swagger/i.test(sourceFile)) {
        const oldSignals = parseOpenApiSignals(oldLines);
        const newSignals = parseOpenApiSignals(newLines);

        for (const endpoint of oldSignals.endpoints) {
            if (!newSignals.endpoints.has(endpoint)) {
                changes.push({
                    type: "removed",
                    path: endpoint,
                    breaking: true,
                    details: `Endpoint ${endpoint} removed from spec`,
                    sourceFile,
                });
            }
        }
        for (const endpoint of newSignals.endpoints) {
            if (!oldSignals.endpoints.has(endpoint)) {
                changes.push({
                    type: "added",
                    path: endpoint,
                    breaking: false,
                    details: `Endpoint ${endpoint} added to spec`,
                    sourceFile,
                });
            }
        }
    } else if (/schema\.(graphql|gql)$|\.proto$/i.test(sourceFile)) {
        const oldDefs = parseGraphqlSignals(oldLines);
        const newDefs = parseGraphqlSignals(newLines);

        for (const def of oldDefs) {
            if (!newDefs.has(def)) {
                changes.push({
                    type: "removed",
                    path: def,
                    breaking: true,
                    details: `Schema symbol removed: ${def}`,
                    sourceFile,
                });
            }
        }
        for (const def of newDefs) {
            if (!oldDefs.has(def)) {
                changes.push({
                    type: "added",
                    path: def,
                    breaking: false,
                    details: `Schema symbol added: ${def}`,
                    sourceFile,
                });
            }
        }
    }

    return changes;
}

async function getFileContentAtRef(
    git: ReturnType<typeof getGit> | null,
    ref: string | undefined,
    filePath: string
): Promise<string | null> {
    if (!git || !ref || !filePath) return null;
    try {
        return await git.show([`${ref}:${filePath}`]);
    } catch {
        return null;
    }
}

// ============================================================================
// IMPACT ANALYSIS
// ============================================================================

export async function analyzeImpact(pullRequestId: string): Promise<{
    breakingChanges: BreakingChange[];
    migrations: MigrationDetection[];
    apiChanges: APIChangeDetection[];
    affectedRepos: string[];
    affectedChangeSets: {
        changeSetId: string;
        repositoryIds: string[];
        pullRequestIds: string[];
    }[];
    riskScore: number;
}> {
    const db = getDatabase();

    const breakingChanges = await db.query.breakingChanges?.findMany({
        where: eq(schema.breakingChanges.pullRequestId, pullRequestId),
    }) || [];

    const migrations = await db.query.migrationDetections?.findMany({
        where: eq(schema.migrationDetections.pullRequestId, pullRequestId),
    }) || [];
    const apiChanges = await db.query.apiChangeDetections?.findMany({
        where: eq(schema.apiChangeDetections.pullRequestId, pullRequestId),
    }) || [];

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, pullRequestId),
    });
    if (!pr) {
        return { breakingChanges, migrations, apiChanges, affectedRepos: [], affectedChangeSets: [], riskScore: 0 };
    }

    const sets = await db.query.changeSetItems?.findMany({
        where: eq(schema.changeSetItems.pullRequestId, pullRequestId),
    }) || [];
    const affectedRepoSet = new Set<string>();
    const affectedChangeSets: {
        changeSetId: string;
        repositoryIds: string[];
        pullRequestIds: string[];
    }[] = [];
    for (const item of sets) {
        const siblings = await db.query.changeSetItems?.findMany({
            where: eq(schema.changeSetItems.changeSetId, item.changeSetId),
        }) || [];
        const repoIds = new Set<string>();
        const prIds = new Set<string>();
        for (const sibling of siblings) {
            repoIds.add(sibling.repositoryId);
            if (sibling.pullRequestId) prIds.add(sibling.pullRequestId);
            if (sibling.repositoryId !== pr.repositoryId) {
                affectedRepoSet.add(sibling.repositoryId);
            }
        }
        affectedChangeSets.push({
            changeSetId: item.changeSetId,
            repositoryIds: Array.from(repoIds),
            pullRequestIds: Array.from(prIds),
        });
    }
    const affectedRepos = Array.from(affectedRepoSet);

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
    for (const apiChange of apiChanges) {
        riskScore += apiChange.breaking ? 12 : 3;
    }

    riskScore = Math.min(100, riskScore);

    return { breakingChanges, migrations, apiChanges, affectedRepos, affectedChangeSets, riskScore };
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
