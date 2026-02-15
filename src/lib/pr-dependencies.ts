/**
 * PR Dependencies Library
 * Detect and manage cross-PR dependencies
 */

import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger";

export interface PRDependency {
    prId: string;
    prNumber: number;
    title: string;
    dependsOn: string[]; // PR IDs this PR depends on
    blockedBy: string[]; // PR IDs blocking this PR
    dependencyType: "branch" | "files" | "manual";
}

export interface DependencyGraph {
    nodes: PRDependency[];
    edges: { from: string; to: string; type: string }[];
}

/**
 * Detect dependencies between PRs based on branch relationships
 */
export async function detectBranchDependencies(
    repositoryId: string
): Promise<DependencyGraph> {
    const db = getDatabase();

    // Get all open PRs for the repo
    const prs = await db.query.pullRequests.findMany({
        where: and(
            eq(schema.pullRequests.repositoryId, repositoryId),
            eq(schema.pullRequests.state, "open")
        ),
    });

    const nodes: PRDependency[] = [];
    const edges: DependencyGraph["edges"] = [];

    // Build a map of branch -> PR
    const branchToPr = new Map<string, typeof prs[0]>();
    for (const pr of prs) {
        branchToPr.set(pr.headBranch, pr);
    }

    // Detect dependencies based on base branch matching another PR's head branch
    for (const pr of prs) {
        const dependsOn: string[] = [];
        const blockedBy: string[] = [];

        // If this PR's base branch is another PR's head branch, it depends on that PR
        const parentPr = branchToPr.get(pr.baseBranch);
        if (parentPr && parentPr.id !== pr.id) {
            dependsOn.push(parentPr.id);
            edges.push({
                from: pr.id,
                to: parentPr.id,
                type: "branch",
            });
        }

        // Find PRs that depend on this PR
        for (const otherPr of prs) {
            if (otherPr.baseBranch === pr.headBranch && otherPr.id !== pr.id) {
                blockedBy.push(otherPr.id);
            }
        }

        nodes.push({
            prId: pr.id,
            prNumber: pr.number,
            title: pr.title,
            dependsOn,
            blockedBy,
            dependencyType: "branch",
        });
    }

    return { nodes, edges };
}

/**
 * Detect file-based dependencies (PRs modifying same files)
 */
export async function detectFileDependencies(
    repositoryId: string
): Promise<{ conflicting: { pr1: string; pr2: string; files: string[] }[] }> {
    // Note: This would require accessing git diff data
    // For now, return empty - implementation would need git integration
    logger.info({ repositoryId }, "File dependency detection not yet implemented");
    return { conflicting: [] };
}

/**
 * Get dependency graph for visualization
 */
export async function getDependencyGraph(repositoryId: string): Promise<DependencyGraph> {
    return detectBranchDependencies(repositoryId);
}

/**
 * Suggest stack ordering based on dependencies
 */
export async function suggestStackOrder(
    prIds: string[]
): Promise<{ order: string[]; cycles: string[][] }> {
    const db = getDatabase();

    // Get PRs
    const prs = await db.query.pullRequests.findMany({
        where: inArray(schema.pullRequests.id, prIds),
    });

    // Build dependency map
    const branchToPr = new Map<string, string>();
    const dependencies = new Map<string, string[]>();

    for (const pr of prs) {
        branchToPr.set(pr.headBranch, pr.id);
        dependencies.set(pr.id, []);
    }

    for (const pr of prs) {
        const parentId = branchToPr.get(pr.baseBranch);
        if (parentId && prIds.includes(parentId)) {
            dependencies.get(pr.id)?.push(parentId);
        }
    }

    // Topological sort
    const order: string[] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const cycles: string[][] = [];

    function visit(id: string, path: string[]): boolean {
        if (inStack.has(id)) {
            // Cycle detected
            const cycleStart = path.indexOf(id);
            cycles.push(path.slice(cycleStart));
            return false;
        }

        if (visited.has(id)) return true;

        visited.add(id);
        inStack.add(id);

        const deps = dependencies.get(id) || [];
        for (const dep of deps) {
            visit(dep, [...path, id]);
        }

        inStack.delete(id);
        order.push(id);
        return true;
    }

    for (const id of prIds) {
        if (!visited.has(id)) {
            visit(id, []);
        }
    }

    return { order, cycles };
}

/**
 * Check if merging a PR would break dependencies
 */
export async function checkMergeSafety(prId: string): Promise<{
    safe: boolean;
    warnings: string[];
}> {
    const db = getDatabase();

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prId),
    });

    if (!pr) {
        return { safe: false, warnings: ["PR not found"] };
    }

    const warnings: string[] = [];

    // Check if any open PRs depend on this PR's head branch
    const dependentPrs = await db.query.pullRequests.findMany({
        where: and(
            eq(schema.pullRequests.baseBranch, pr.headBranch),
            eq(schema.pullRequests.state, "open"),
            eq(schema.pullRequests.repositoryId, pr.repositoryId)
        ),
    });

    if (dependentPrs.length > 0) {
        warnings.push(
            `${dependentPrs.length} PR(s) depend on this branch: ${dependentPrs.map(p => `#${p.number}`).join(", ")}`
        );
    }

    return {
        safe: warnings.length === 0,
        warnings,
    };
}
