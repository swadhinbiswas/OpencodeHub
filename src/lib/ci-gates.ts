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
 * Safe expression evaluator — replaces dangerous `new Function()`.
 * Only supports simple property comparisons on the PR object.
 * Allowed patterns: pr.property === "value", pr.property !== "value",
 *                   pr.property == value, pr.property >= value, etc.
 */
function evaluateSafeExpression(script: string, pr: any): boolean {
    // Only allow simple comparisons on pr.* properties
    const allowedPattern = /^pr\.\w+\s*(===|!==|==|!=|>=|<=|>|<)\s*(?:"[^"]*"|'[^']*'|\d+)$/;
    const normalized = script.trim();

    if (!allowedPattern.test(normalized)) {
        logger.warn({ script: normalized }, "Rejected unsafe gate expression");
        return false;
    }

    // Parse the expression
    const match = normalized.match(/^(pr\.(\w+))\s*(===|!==|==|!=|>=|<=|>|<)\s*(?:"([^"]*)"|'([^']*)'|(\d+))$/);
    if (!match) return false;

    const [, , prop, operator, strVal1, strVal2, numVal] = match;
    const propValue = pr[prop];
    const compareVal = strVal1 ?? strVal2 ?? (numVal ? Number(numVal) : undefined);

    switch (operator) {
        case "===": return propValue === compareVal;
        case "!==": return propValue !== compareVal;
        case "==": return propValue == compareVal;
        case "!=": return propValue != compareVal;
        case ">=": return Number(propValue) >= Number(compareVal);
        case "<=": return Number(propValue) <= Number(compareVal);
        case ">": return Number(propValue) > Number(compareVal);
        case "<": return Number(propValue) < Number(compareVal);
        default: return false;
    }
}

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

type EvaluatablePullRequest = typeof schema.pullRequests.$inferSelect & {
    reviews: Array<typeof schema.pullRequestReviews.$inferSelect>;
    checks: Array<typeof schema.pullRequestChecks.$inferSelect>;
};

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
                details: { gateType: "status_check", branch: required.branch, strictMode: required.strictMode },
            });
        } else if (check.conclusion !== "success") {
            results.push({
                passed: false,
                gateName: `Status: ${required.checkName}`,
                message: `Check ${check.status}: ${check.conclusion || "pending"}`,
                details: { gateType: "status_check", branch: required.branch, strictMode: required.strictMode },
            });
        } else {
            results.push({
                passed: true,
                gateName: `Status: ${required.checkName}`,
                message: "Check passed",
                details: { gateType: "status_check", branch: required.branch, strictMode: required.strictMode },
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
            details: { gateType: "review" },
        });
    } else if (changesRequested) {
        results.push({
            passed: false,
            gateName: "Review",
            message: "Changes requested by reviewer",
            details: { gateType: "review" },
        });
    } else {
        results.push({
            passed: true,
            gateName: "Review",
            message: `${approvals.length} approval(s)`,
            details: { gateType: "review", approvals: approvals.length },
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
            details: { gateType: "conflict" },
        });
    } else {
        results.push({
            passed: true,
            gateName: "Merge Conflicts",
            message: "No conflicts",
            details: { gateType: "conflict" },
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
    pr: EvaluatablePullRequest
): Promise<GateResult> {
    const db = getDatabase();
    const config = gate.config ? JSON.parse(gate.config) : {};

    switch (gate.gateType) {
        case "label": {
            const labelLinks = await db.query.pullRequestLabels?.findMany({
                where: eq(schema.pullRequestLabels.pullRequestId, pr.id),
                with: { label: true },
            }) || [];
            const labelNames = new Set(
                labelLinks
                    .map((item) => item.label?.name)
                    .filter((name): name is string => Boolean(name))
            );

            const requiredLabelsRaw = config.required;
            const blockedLabelsRaw = config.blocked;
            const requiredLabels = Array.isArray(requiredLabelsRaw)
                ? requiredLabelsRaw.filter((value): value is string => typeof value === "string" && value.length > 0)
                : typeof requiredLabelsRaw === "string" && requiredLabelsRaw.length > 0
                    ? [requiredLabelsRaw]
                    : [];
            const blockedLabels = Array.isArray(blockedLabelsRaw)
                ? blockedLabelsRaw.filter((value): value is string => typeof value === "string" && value.length > 0)
                : typeof blockedLabelsRaw === "string" && blockedLabelsRaw.length > 0
                    ? [blockedLabelsRaw]
                    : [];

            const missingRequired = requiredLabels.filter((label) => !labelNames.has(label));
            const presentBlocked = blockedLabels.filter((label) => labelNames.has(label));

            if (missingRequired.length > 0) {
                return {
                    passed: false,
                    gateName: gate.name,
                    message: `Missing required labels: ${missingRequired.join(", ")}`,
                    details: { gateType: "label", missingRequired, blockedLabels: blockedLabels },
                };
            }
            if (presentBlocked.length > 0) {
                return {
                    passed: false,
                    gateName: gate.name,
                    message: `Blocked labels present: ${presentBlocked.join(", ")}`,
                    details: { gateType: "label", presentBlocked, requiredLabels },
                };
            }
            return {
                passed: true,
                gateName: gate.name,
                message: "Label check passed",
                details: { gateType: "label", requiredLabels, blockedLabels },
            };
        }

        case "review": {
            const minReviews = typeof config.minReviews === "number" && config.minReviews > 0
                ? Math.floor(config.minReviews)
                : 1;
            const latestByReviewer = new Map<string, typeof pr.reviews[number]>();
            for (const review of pr.reviews || []) {
                const previous = latestByReviewer.get(review.reviewerId);
                const reviewTime = review.submittedAt || review.createdAt || new Date(0);
                const previousTime = previous ? (previous.submittedAt || previous.createdAt || new Date(0)) : new Date(0);
                if (!previous || reviewTime >= previousTime) {
                    latestByReviewer.set(review.reviewerId, review);
                }
            }

            const latestReviews = [...latestByReviewer.values()];
            const approvalCount = latestReviews.filter((review) => review.state === "approved").length;
            const hasChangesRequested = latestReviews.some((review) => review.state === "changes_requested");

            if (hasChangesRequested) {
                return {
                    passed: false,
                    gateName: gate.name,
                    message: "Changes requested by reviewer",
                    details: { gateType: "review", minReviews, approvalCount },
                };
            }
            if (approvalCount < minReviews) {
                return {
                    passed: false,
                    gateName: gate.name,
                    message: `Needs ${minReviews - approvalCount} more approval(s)`,
                    details: { gateType: "review", minReviews, approvalCount },
                };
            }
            return {
                passed: true,
                gateName: gate.name,
                message: `Review requirements met (${approvalCount}/${minReviews})`,
                details: { gateType: "review", minReviews, approvalCount },
            };
        }

        case "custom": {
            // Execute custom condition script — SAFELY
            // Custom scripts are restricted to simple boolean expressions
            // that reference PR properties. No arbitrary code execution.
            if (gate.conditionScript) {
                try {
                    const passed = evaluateSafeExpression(gate.conditionScript, pr);
                    return {
                        passed: Boolean(passed),
                        gateName: gate.name,
                        message: passed ? "Custom gate passed" : "Custom gate failed",
                        details: { gateType: "custom" },
                    };
                } catch (error) {
                    return {
                        passed: false,
                        gateName: gate.name,
                        message: "Error evaluating gate",
                        details: { gateType: "custom" },
                    };
                }
            }
            return {
                passed: true,
                gateName: gate.name,
                message: "No condition defined",
                details: { gateType: "custom" },
            };
        }

        default:
            return {
                passed: true,
                gateName: gate.name,
                message: "Unknown gate type",
                details: { gateType: gate.gateType || "unknown" },
            };
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

/**
 * Delete merge gate
 */
export async function removeMergeGate(gateId: string): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.delete(schema.mergeGates)
            .where(eq(schema.mergeGates.id, gateId));
        return true;
    } catch {
        return false;
    }
}
