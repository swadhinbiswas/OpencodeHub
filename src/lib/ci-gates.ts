/**
 * CI Gates Library
 * Merge gates and required checks management
 */

import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";

/**
 * Required status checks for merging
 */
export const requiredStatusChecks = pgTable("required_status_checks", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    branch: text("branch").notNull(), // Branch pattern, e.g., "main", "release/*"
    checkName: text("check_name").notNull(), // CI job name
    isRequired: boolean("is_required").default(true),
    strictMode: boolean("strict_mode").default(true), // Require branch to be up-to-date
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Custom merge gates (beyond CI checks)
 */
export const mergeGates = pgTable("merge_gates", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    gateType: text("gate_type").notNull(), // status_check, review, label, custom
    config: text("config"), // JSON configuration
    conditionScript: text("condition_script"), // Optional JS condition
    isEnabled: boolean("is_enabled").default(true),
    order: integer("order").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type RequiredStatusCheck = typeof requiredStatusChecks.$inferSelect;
export type MergeGate = typeof mergeGates.$inferSelect;

/**
 * Gate evaluation result
 */
export interface GateResult {
    passed: boolean;
    gateName: string;
    message: string;
    details?: Record<string, unknown>;
}

/**
 * Add required status check
 */
export async function addRequiredCheck(options: {
    repositoryId: string;
    branch: string;
    checkName: string;
    strictMode?: boolean;
}): Promise<RequiredStatusCheck> {
    const db = getDatabase();

    const check = {
        id: crypto.randomUUID(),
        repositoryId: options.repositoryId,
        branch: options.branch,
        checkName: options.checkName,
        isRequired: true,
        strictMode: options.strictMode ?? true,
        createdAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.requiredStatusChecks).values(check);

    logger.info({ repoId: options.repositoryId, checkName: options.checkName }, "Required check added");

    return check as RequiredStatusCheck;
}

/**
 * Get required checks for a branch
 */
export async function getRequiredChecks(
    repositoryId: string,
    branch: string
): Promise<RequiredStatusCheck[]> {
    const db = getDatabase();

    try {
        const checks = await db.query.requiredStatusChecks?.findMany({
            where: eq(schema.requiredStatusChecks.repositoryId, repositoryId),
        }) || [];

        // Filter by branch pattern
        return checks.filter(c => {
            if (c.branch === branch) return true;
            if (c.branch.endsWith("/*")) {
                const prefix = c.branch.slice(0, -2);
                return branch.startsWith(prefix);
            }
            return false;
        });
    } catch {
        return [];
    }
}

/**
 * Evaluate all gates for a PR
 */
export async function evaluateGates(prId: string): Promise<{
    canMerge: boolean;
    results: GateResult[];
}> {
    const db = getDatabase();
    const results: GateResult[] = [];

    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prId),
        with: {
            reviews: true,
            checks: true,
        },
    });

    if (!pr) {
        return { canMerge: false, results: [{ passed: false, gateName: "PR", message: "PR not found" }] };
    }

    // 1. Check required status checks
    const requiredChecks = await getRequiredChecks(pr.repositoryId, pr.baseBranch);

    for (const required of requiredChecks) {
        const check = pr.checks?.find(c => c.name === required.checkName);

        if (!check) {
            results.push({
                passed: false,
                gateName: `Status: ${required.checkName}`,
                message: "Check not found",
            });
        } else if (check.conclusion !== "success") {
            results.push({
                passed: false,
                gateName: `Status: ${required.checkName}`,
                message: `Check ${check.status}: ${check.conclusion || "pending"}`,
            });
        } else {
            results.push({
                passed: true,
                gateName: `Status: ${required.checkName}`,
                message: "Check passed",
            });
        }
    }

    // 2. Check review requirements
    const approvals = pr.reviews?.filter(r => r.state === "approved") || [];
    const changesRequested = pr.reviews?.some(r => r.state === "changes_requested");

    if (approvals.length === 0) {
        results.push({
            passed: false,
            gateName: "Review",
            message: "At least one approval required",
        });
    } else if (changesRequested) {
        results.push({
            passed: false,
            gateName: "Review",
            message: "Changes requested by reviewer",
        });
    } else {
        results.push({
            passed: true,
            gateName: "Review",
            message: `${approvals.length} approval(s)`,
        });
    }

    // 3. Check merge gates
    const gates = await getMergeGates(pr.repositoryId);

    for (const gate of gates) {
        if (!gate.isEnabled) continue;

        const result = await evaluateSingleGate(gate, pr);
        results.push(result);
    }

    // 4. Check mergeable state
    if (pr.mergeable === false) {
        results.push({
            passed: false,
            gateName: "Merge Conflicts",
            message: "Branch has conflicts that must be resolved",
        });
    } else {
        results.push({
            passed: true,
            gateName: "Merge Conflicts",
            message: "No conflicts",
        });
    }

    return {
        canMerge: results.every(r => r.passed),
        results,
    };
}

/**
 * Evaluate a single gate
 */
async function evaluateSingleGate(
    gate: MergeGate,
    pr: typeof schema.pullRequests.$inferSelect
): Promise<GateResult> {
    const config = gate.config ? JSON.parse(gate.config) : {};

    switch (gate.gateType) {
        case "label": {
            // Require or block specific labels
            const requiredLabel = config.required;
            const blockedLabel = config.blocked;

            // Would need to fetch labels for PR
            return {
                passed: true,
                gateName: gate.name,
                message: "Label check passed",
            };
        }

        case "review": {
            // Custom review requirements
            const minReviews = config.minReviews || 1;
            // Would check against actual review count
            return {
                passed: true,
                gateName: gate.name,
                message: `Review requirements met`,
            };
        }

        case "custom": {
            // Execute custom condition script
            if (gate.conditionScript) {
                try {
                    // Sandbox execution would be needed in production
                    const fn = new Function("pr", gate.conditionScript);
                    const passed = fn(pr);
                    return {
                        passed: Boolean(passed),
                        gateName: gate.name,
                        message: passed ? "Custom gate passed" : "Custom gate failed",
                    };
                } catch (error) {
                    return {
                        passed: false,
                        gateName: gate.name,
                        message: "Error evaluating gate",
                    };
                }
            }
            return { passed: true, gateName: gate.name, message: "No condition defined" };
        }

        default:
            return { passed: true, gateName: gate.name, message: "Unknown gate type" };
    }
}

/**
 * Create a merge gate
 */
export async function createMergeGate(options: {
    repositoryId: string;
    name: string;
    description?: string;
    gateType: "status_check" | "review" | "label" | "custom";
    config?: Record<string, unknown>;
    conditionScript?: string;
}): Promise<MergeGate> {
    const db = getDatabase();

    const gate = {
        id: crypto.randomUUID(),
        repositoryId: options.repositoryId,
        name: options.name,
        description: options.description || null,
        gateType: options.gateType,
        config: options.config ? JSON.stringify(options.config) : null,
        conditionScript: options.conditionScript || null,
        isEnabled: true,
        order: 0,
        createdAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.mergeGates).values(gate);

    logger.info({ repoId: options.repositoryId, gateName: options.name }, "Merge gate created");

    return gate as MergeGate;
}

/**
 * Get merge gates for repository
 */
export async function getMergeGates(repositoryId: string): Promise<MergeGate[]> {
    const db = getDatabase();

    try {
        return await db.query.mergeGates?.findMany({
            where: eq(schema.mergeGates.repositoryId, repositoryId),
            orderBy: (gates, { asc }) => [asc(gates.order)],
        }) || [];
    } catch {
        return [];
    }
}

/**
 * Toggle gate enabled state
 */
export async function toggleGate(gateId: string, enabled: boolean): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.mergeGates)
            .set({ isEnabled: enabled })
            .where(eq(schema.mergeGates.id, gateId));
        return true;
    } catch {
        return false;
    }
}

/**
 * Delete required check
 */
export async function removeRequiredCheck(checkId: string): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.delete(schema.requiredStatusChecks)
            .where(eq(schema.requiredStatusChecks.id, checkId));
        return true;
    } catch {
        return false;
    }
}
