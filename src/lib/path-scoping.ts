/**
 * Path Scoping Library
 * Validates user permissions for specific file paths in monorepos
 */

import { getDatabase, schema } from "@/db";
import { eq, and, or } from "drizzle-orm";
import { logger } from "./logger";
import { minimatch } from "minimatch";

interface PathPermissionCheck {
    allowed: boolean;
    deniedPaths: string[];
    reason?: string;
}

/**
 * Check if a user has permission to modify specific paths
 */
export async function checkPathPermissions(
    userId: string,
    repositoryId: string,
    paths: string[],
    requiredPermission: "read" | "write" | "admin" = "write"
): Promise<PathPermissionCheck> {
    const db = getDatabase();

    // Get user's teams
    const userTeams = await db.query.teamMembers.findMany({
        where: eq(schema.teamMembers.userId, userId),
        columns: { teamId: true },
    });
    const teamIds = userTeams.map(t => t.teamId);

    // Get all path permissions for this repo
    const permissions = await db.query.repositoryPathPermissions.findMany({
        where: eq(schema.repositoryPathPermissions.repositoryId, repositoryId),
    });

    if (permissions.length === 0) {
        // No path restrictions - allow all
        return { allowed: true, deniedPaths: [] };
    }

    const deniedPaths: string[] = [];

    for (const path of paths) {
        let hasPermission = false;

        for (const perm of permissions) {
            // Check if path matches pattern
            if (!minimatch(path, perm.pathPattern)) {
                continue;
            }

            // Check if user or team has permission
            const isUserMatch = perm.userId === userId;
            const isTeamMatch = perm.teamId && teamIds.includes(perm.teamId);

            if (isUserMatch || isTeamMatch) {
                // Check permission level
                const permLevel = getPermissionLevel(perm.permission);
                const requiredLevel = getPermissionLevel(requiredPermission);

                if (permLevel >= requiredLevel) {
                    hasPermission = true;
                    break;
                }
            }
        }

        // Check if any permission covers this path
        const hasCoverage = permissions.some(p => minimatch(path, p.pathPattern));

        if (hasCoverage && !hasPermission) {
            deniedPaths.push(path);
        }
    }

    return {
        allowed: deniedPaths.length === 0,
        deniedPaths,
        reason: deniedPaths.length > 0
            ? `Insufficient permissions for paths: ${deniedPaths.join(", ")}`
            : undefined,
    };
}

function getPermissionLevel(permission: string): number {
    switch (permission) {
        case "admin": return 3;
        case "write": return 2;
        case "read": return 1;
        default: return 0;
    }
}

/**
 * Get all path permissions for a repository
 */
export async function getPathPermissions(repositoryId: string) {
    const db = getDatabase();

    return db.query.repositoryPathPermissions.findMany({
        where: eq(schema.repositoryPathPermissions.repositoryId, repositoryId),
        with: {
            user: { columns: { id: true, username: true } },
            team: { columns: { id: true, name: true } },
        },
    });
}

/**
 * Add a path permission
 */
export async function addPathPermission(options: {
    repositoryId: string;
    pathPattern: string;
    userId?: string;
    teamId?: string;
    permission: "read" | "write" | "admin";
    requireApproval?: boolean;
}): Promise<boolean> {
    const db = getDatabase();

    if (!options.userId && !options.teamId) {
        throw new Error("Either userId or teamId is required");
    }

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.repositoryPathPermissions).values({
            id: crypto.randomUUID(),
            repositoryId: options.repositoryId,
            pathPattern: options.pathPattern,
            userId: options.userId,
            teamId: options.teamId,
            permission: options.permission,
            requireApproval: options.requireApproval ? "true" : "false",
        });

        logger.info({ repositoryId: options.repositoryId, pathPattern: options.pathPattern },
            "Path permission added");

        return true;
    } catch (error) {
        logger.error({ error }, "Failed to add path permission");
        return false;
    }
}

/**
 * Remove a path permission
 */
export async function removePathPermission(permissionId: string): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.delete(schema.repositoryPathPermissions)
            .where(eq(schema.repositoryPathPermissions.id, permissionId));

        return true;
    } catch (error) {
        logger.error({ error }, "Failed to remove path permission");
        return false;
    }
}
