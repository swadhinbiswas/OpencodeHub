/**
 * CODEOWNERS Parser Library
 * Parse and match CODEOWNERS file for automatic reviewer assignment
 */

import { minimatch } from "minimatch";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, or } from "drizzle-orm";
import { schema } from "@/db";

export interface CodeOwnerRule {
    pattern: string;
    owners: string[];
    lineNumber: number;
}

export interface CodeOwnersFile {
    rules: CodeOwnerRule[];
    path: string;
}

/**
 * Parse CODEOWNERS file content
 */
export function parseCodeOwners(content: string, filePath: string = "CODEOWNERS"): CodeOwnersFile {
    const rules: CodeOwnerRule[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines and comments
        if (!line || line.startsWith("#")) {
            continue;
        }

        // Parse the line: pattern owner1 owner2 ...
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length < 2) {
            continue; // Invalid line, needs pattern + at least one owner
        }

        const pattern = parts[0];
        const owners = parts.slice(1).map(normalizeOwner);

        rules.push({
            pattern,
            owners,
            lineNumber: i + 1,
        });
    }

    return { rules, path: filePath };
}

/**
 * Normalize owner format (remove @ prefix if present)
 */
function normalizeOwner(owner: string): string {
    return owner.startsWith("@") ? owner.slice(1) : owner;
}

/**
 * Find owners for a specific file path
 * Returns the owners from the LAST matching rule (CODEOWNERS uses last-match-wins)
 */
export function findOwnersForFile(
    codeOwners: CodeOwnersFile,
    filePath: string
): string[] {
    let matchedOwners: string[] = [];

    for (const rule of codeOwners.rules) {
        if (matchPattern(rule.pattern, filePath)) {
            matchedOwners = rule.owners;
        }
    }

    return matchedOwners;
}

/**
 * Find owners for multiple file paths
 * Returns unique owners from all matching rules
 */
export function findOwnersForFiles(
    codeOwners: CodeOwnersFile,
    filePaths: string[]
): string[] {
    const ownerSet = new Set<string>();

    for (const filePath of filePaths) {
        const owners = findOwnersForFile(codeOwners, filePath);
        for (const owner of owners) {
            ownerSet.add(owner);
        }
    }

    return Array.from(ownerSet);
}

/**
 * Match a file path against a CODEOWNERS pattern
 */
function matchPattern(pattern: string, filePath: string): boolean {
    // Normalize paths
    const normalizedPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
    let normalizedPattern = pattern;

    // Handle patterns starting with /
    if (normalizedPattern.startsWith("/")) {
        normalizedPattern = normalizedPattern.slice(1);
    }

    // Handle directory patterns ending with /
    if (normalizedPattern.endsWith("/")) {
        normalizedPattern = normalizedPattern + "**";
    }

    // Handle patterns without leading directory
    // e.g., "*.js" should match "src/foo.js"
    if (!normalizedPattern.includes("/") && !normalizedPattern.startsWith("**/")) {
        normalizedPattern = "**/" + normalizedPattern;
    }

    return minimatch(normalizedPath, normalizedPattern, {
        dot: true,
        matchBase: false,
    });
}

/**
 * Get suggested reviewers for a PR based on changed files
 */
export async function getSuggestedReviewers(
    codeOwnersContent: string,
    changedFiles: string[],
    excludeAuthors: string[] = []
): Promise<{
    owners: string[];
    coverage: { file: string; owners: string[] }[];
}> {
    const codeOwners = parseCodeOwners(codeOwnersContent);
    const coverage: { file: string; owners: string[] }[] = [];

    for (const file of changedFiles) {
        const owners = findOwnersForFile(codeOwners, file);
        coverage.push({ file, owners });
    }

    // Get unique owners, excluding PR authors
    const allOwners = findOwnersForFiles(codeOwners, changedFiles);
    const suggestedOwners = allOwners.filter(
        (owner) => !excludeAuthors.includes(owner)
    );

    return {
        owners: suggestedOwners,
        coverage,
    };
}

/**
 * Common CODEOWNERS locations in order of priority
 */
export const CODEOWNERS_PATHS = [
    "CODEOWNERS",
    ".github/CODEOWNERS",
    "docs/CODEOWNERS",
];

export async function expandOwnersToUsernames(options: {
    db: NodePgDatabase<typeof schema>;
    repository: typeof schema.repositories.$inferSelect;
    owners: string[];
}): Promise<Set<string>> {
    const { db, repository, owners } = options;
    const results = new Set<string>();

    let org = null;
    if (repository.ownerType === "organization") {
        org = await db.query.organizations.findFirst({
            where: eq(schema.organizations.id, repository.ownerId),
        });
    }

    for (const owner of owners) {
        const normalized = owner.startsWith("@") ? owner.slice(1) : owner;

        if (!normalized.includes("/")) {
            results.add(normalized);
            continue;
        }

        const [orgPart, teamPart] = normalized.split("/");
        if (!teamPart) continue;

        let orgId = repository.ownerType === "organization" ? repository.ownerId : null;
        if (orgPart && org && org.name !== orgPart) {
            const orgByName = await db.query.organizations.findFirst({
                where: eq(schema.organizations.name, orgPart),
            });
            orgId = orgByName?.id || orgId;
        }

        if (!orgId) continue;

        const team = await db.query.teams.findFirst({
            where: and(
                eq(schema.teams.organizationId, orgId),
                or(eq(schema.teams.slug, teamPart), eq(schema.teams.name, teamPart))
            ),
        });

        if (!team) continue;

        const members = await db.query.teamMembers.findMany({
            where: eq(schema.teamMembers.teamId, team.id),
            with: { user: true },
        });

        for (const member of members) {
            if (member.user?.username) {
                results.add(member.user.username);
            }
        }
    }

    return results;
}

/**
 * Validate CODEOWNERS content and return any errors
 */
export function validateCodeOwners(content: string): {
    valid: boolean;
    errors: { line: number; message: string }[];
    warnings: { line: number; message: string }[];
} {
    const errors: { line: number; message: string }[] = [];
    const warnings: { line: number; message: string }[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNum = i + 1;

        // Skip empty lines and comments
        if (!line || line.startsWith("#")) {
            continue;
        }

        const parts = line.split(/\s+/).filter(Boolean);

        if (parts.length < 2) {
            errors.push({
                line: lineNum,
                message: "Invalid syntax: needs pattern and at least one owner",
            });
            continue;
        }

        const pattern = parts[0];
        const owners = parts.slice(1);

        // Check for invalid patterns
        try {
            minimatch.makeRe(pattern);
        } catch {
            errors.push({
                line: lineNum,
                message: `Invalid glob pattern: ${pattern}`,
            });
        }

        // Check owners format
        for (const owner of owners) {
            if (!owner.startsWith("@") && !owner.includes("/")) {
                warnings.push({
                    line: lineNum,
                    message: `Owner "${owner}" should start with @ or be a team (org/team)`,
                });
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
