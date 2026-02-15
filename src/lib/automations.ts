/**
 * Automations Engine Library
 * Workflow automation with triggers, conditions, and actions
 */

import { eq, and, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { logger } from "@/lib/logger";
import { generateId } from "./utils";
import type {
    AutomationTrigger,
    AutomationAction,
    AutomationCondition
} from "@/db/schema/automations";

/**
 * Trigger an automation event
 * This is the main entry point for automation processing
 */
export async function triggerAutomation(
    repositoryId: string,
    event: AutomationTrigger,
    context: {
        pullRequestId?: string;
        issueId?: string;
        labelName?: string;
        userId?: string;
        metadata?: Record<string, unknown>;
    }
) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const startTime = Date.now();

    try {
        // Get all enabled rules for this trigger
        const rules = await db.query.automationRules.findMany({
            where: and(
                eq(schema.automationRules.repositoryId, repositoryId),
                eq(schema.automationRules.trigger, event),
                eq(schema.automationRules.isEnabled, true)
            ),
            orderBy: [desc(schema.automationRules.priority)],
        });

        if (rules.length === 0) {
            return { triggered: 0, executed: 0 };
        }

        let executed = 0;

        for (const rule of rules) {
            const executionId = generateId();

            try {
                // Check conditions
                const conditions = rule.conditions ? JSON.parse(rule.conditions) as AutomationCondition[] : [];
                const conditionsMatched = await evaluateConditions(conditions, context);

                // Log execution start
                await db.insert(schema.automationExecutions).values({
                    id: executionId,
                    ruleId: rule.id,
                    triggeredById: context.pullRequestId || context.issueId,
                    triggeredByType: context.pullRequestId ? "pull_request" : context.issueId ? "issue" : "other",
                    triggerEvent: event,
                    conditionsMatched,
                    status: "pending",
                    createdAt: new Date(),
                });

                if (!conditionsMatched) {
                    await db
                        .update(schema.automationExecutions)
                        .set({ status: "skipped" })
                        .where(eq(schema.automationExecutions.id, executionId));
                    continue;
                }

                // Execute actions
                const actions = JSON.parse(rule.actions) as AutomationAction[];
                const executedActions: string[] = [];

                for (const action of actions) {
                    await executeAction(action, context);
                    executedActions.push(action.type);
                }

                // Update execution record
                const durationMs = Date.now() - startTime;
                await db
                    .update(schema.automationExecutions)
                    .set({
                        status: "success",
                        actionsExecuted: JSON.stringify(executedActions),
                        durationMs,
                    })
                    .where(eq(schema.automationExecutions.id, executionId));

                // Update rule stats
                await db
                    .update(schema.automationRules)
                    .set({
                        runCount: (rule.runCount || 0) + 1,
                        lastRunAt: new Date(),
                    })
                    .where(eq(schema.automationRules.id, rule.id));

                executed++;

            } catch (error) {
                logger.error("Automation execution failed", {
                    ruleId: rule.id,
                    error: error instanceof Error ? error.message : "Unknown error",
                });

                await db
                    .update(schema.automationExecutions)
                    .set({
                        status: "failed",
                        errorMessage: error instanceof Error ? error.message : "Unknown error",
                        durationMs: Date.now() - startTime,
                    })
                    .where(eq(schema.automationExecutions.id, executionId));
            }
        }

        return { triggered: rules.length, executed };

    } catch (error) {
        logger.error("Failed to trigger automation", {
            repositoryId,
            event,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
    }
}

/**
 * Evaluate conditions against the context
 */
async function evaluateConditions(
    conditions: AutomationCondition[],
    context: Record<string, unknown>
): Promise<boolean> {
    if (conditions.length === 0) return true;

    for (const condition of conditions) {
        const value = getNestedValue(context, condition.field);
        const matched = evaluateCondition(condition.operator, value, condition.value);

        if (!matched) return false;
    }

    return true;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>((acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined
        , obj as unknown);
}

function evaluateCondition(
    operator: string,
    actual: unknown,
    expected: unknown
): boolean {
    switch (operator) {
        case "equals":
            return actual === expected;
        case "not_equals":
            return actual !== expected;
        case "contains":
            if (Array.isArray(actual)) {
                return actual.includes(expected);
            }
            if (typeof actual === "string" && typeof expected === "string") {
                return actual.includes(expected);
            }
            return false;
        case "not_contains":
            if (Array.isArray(actual)) {
                return !actual.includes(expected);
            }
            if (typeof actual === "string" && typeof expected === "string") {
                return !actual.includes(expected);
            }
            return true;
        case "matches":
            if (typeof actual === "string" && typeof expected === "string") {
                return new RegExp(expected).test(actual);
            }
            return false;
        case "greater_than":
            return typeof actual === "number" && typeof expected === "number" && actual > expected;
        case "less_than":
            return typeof actual === "number" && typeof expected === "number" && actual < expected;
        default:
            return false;
    }
}

/**
 * Execute an automation action
 */
async function executeAction(
    action: AutomationAction,
    context: {
        pullRequestId?: string;
        issueId?: string;
        userId?: string;
        metadata?: Record<string, unknown>;
    }
) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    switch (action.type) {
        case "add_label": {
            if (context.pullRequestId && action.params.label) {
                // Add label to PR
                await db.insert(schema.pullRequestLabels).values({
                    id: generateId(),
                    pullRequestId: context.pullRequestId,
                    labelId: action.params.label as string,
                }).onConflictDoNothing();
            }
            break;
        }

        case "remove_label": {
            if (context.pullRequestId && action.params.label) {
                await db
                    .delete(schema.pullRequestLabels)
                    .where(and(
                        eq(schema.pullRequestLabels.pullRequestId, context.pullRequestId),
                        eq(schema.pullRequestLabels.labelId, action.params.label as string)
                    ));
            }
            break;
        }

        case "assign_reviewer": {
            if (context.pullRequestId && action.params.assignee) {
                const assignee = action.params.assignee as string;

                // Handle @codeowners - assign reviewers based on CODEOWNERS file
                if (assignee === "@codeowners") {
                    try {
                        // Get PR details with changed files
                        const pr = await db.query.pullRequests.findFirst({
                            where: eq(schema.pullRequests.id, context.pullRequestId),
                            with: { repository: true },
                        });

                        if (pr && pr.repository) {
                            // Dynamically import to avoid circular deps
                            const { resolveRepoPath } = await import("./git-storage");
                            const { getFileContent } = await import("./git");
                            const { CODEOWNERS_PATHS, getSuggestedReviewers } = await import("./codeowners");
                            const { compareBranches } = await import("./git");

                            const repoPath = await resolveRepoPath(pr.repository.diskPath);

                            // Try to find CODEOWNERS file
                            let codeOwnersContent: string | null = null;
                            for (const path of CODEOWNERS_PATHS) {
                                try {
                                    const result = await getFileContent(repoPath, path, pr.baseBranch);
                                    if (result && !result.isBinary) {
                                        codeOwnersContent = result.content;
                                        break;
                                    }
                                } catch {
                                    // File doesn't exist at this path
                                }
                            }

                            if (codeOwnersContent) {
                                // Get changed files
                                const { diffs } = await compareBranches(repoPath, pr.baseBranch, pr.headBranch);
                                const changedFiles = diffs.map(d => d.file);

                                // Get PR author username for exclusion
                                const prAuthor = await db.query.users.findFirst({
                                    where: eq(schema.users.id, pr.authorId),
                                });

                                // Get suggested reviewers
                                const { owners } = await getSuggestedReviewers(
                                    codeOwnersContent,
                                    changedFiles,
                                    prAuthor ? [prAuthor.username] : []
                                );

                                // Add each owner as reviewer
                                for (const owner of owners) {
                                    const user = await db.query.users.findFirst({
                                        where: eq(schema.users.username, owner),
                                    });

                                    if (user) {
                                        await db.insert(schema.pullRequestReviewers).values({
                                            id: generateId(),
                                            pullRequestId: context.pullRequestId,
                                            userId: user.id,
                                            requestedAt: new Date(),
                                        }).onConflictDoNothing();
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        logger.warn({ error }, "Failed to assign CODEOWNERS reviewers");
                    }
                    break;
                }

                // Find user by username
                const user = await db.query.users.findFirst({
                    where: eq(schema.users.username, assignee.replace("@", "")),
                });

                if (user) {
                    await db.insert(schema.pullRequestReviewers).values({
                        id: generateId(),
                        pullRequestId: context.pullRequestId,
                        userId: user.id,
                        requestedAt: new Date(),
                    }).onConflictDoNothing();
                }
            }
            break;
        }

        case "add_comment": {
            if (context.pullRequestId && action.params.body) {
                await db.insert(schema.pullRequestComments).values({
                    id: generateId(),
                    pullRequestId: context.pullRequestId,
                    authorId: context.userId || "system",
                    body: action.params.body as string,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }
            break;
        }

        case "add_to_merge_queue": {
            if (context.pullRequestId) {
                const { addToMergeQueue } = await import("./merge-queue");
                const pr = await db.query.pullRequests.findFirst({
                    where: eq(schema.pullRequests.id, context.pullRequestId),
                });

                if (pr) {
                    await addToMergeQueue({
                        repositoryId: pr.repositoryId,
                        pullRequestId: context.pullRequestId,
                        addedById: context.userId || "system",
                        mergeMethod: (action.params.method as "merge" | "squash" | "rebase") || "squash",
                    });
                }
            }
            break;
        }

        case "trigger_ai_review": {
            if (context.pullRequestId) {
                const { triggerAIReview } = await import("./ai-review");
                await triggerAIReview(
                    context.pullRequestId,
                    context.userId || "system",
                    {
                        provider: "anthropic" as const,
                        model: "claude-3-sonnet" as const,
                    }
                );
            }
            break;
        }

        case "notify_slack": {
            if (context.pullRequestId && action.params.channel) {
                const { notifyPrEvent } = await import("./slack-notifications");
                const pr = await db.query.pullRequests.findFirst({
                    where: eq(schema.pullRequests.id, context.pullRequestId),
                    with: { repository: true, author: true },
                });

                if (pr && pr.repository) {
                    // Would need org ID detection
                    // await notifyPrEvent(...)
                }
            }
            break;
        }

        case "notify_discord": {
            if (context.pullRequestId && action.params.webhookUrl) {
                const { sendDiscordMessage } = await import("./integrations/discord");
                const pr = await db.query.pullRequests.findFirst({
                    where: eq(schema.pullRequests.id, context.pullRequestId),
                    with: { repository: true, author: true },
                });

                if (pr && pr.repository) {
                    await sendDiscordMessage(action.params.webhookUrl as string, {
                        content: `**${pr.title}** (#${pr.number}) in ${pr.repository.name}\nState: ${pr.state}`,
                        username: "OpenCodeHub"
                    });
                }
            }
            break;
        }

        case "notify_teams": {
            if (context.pullRequestId && action.params.webhookUrl) {
                const { sendTeamsMessage } = await import("./integrations/teams");
                const pr = await db.query.pullRequests.findFirst({
                    where: eq(schema.pullRequests.id, context.pullRequestId),
                    with: { repository: true, author: true },
                });

                if (pr && pr.repository) {
                    await sendTeamsMessage(action.params.webhookUrl as string, {
                        "@type": "MessageCard",
                        "@context": "http://schema.org/extensions",
                        themeColor: "0078d4",
                        summary: `PR Update: ${pr.title}`,
                        sections: [{
                            text: `**${pr.title}** (#${pr.number}) in ${pr.repository.name}\nStatus: ${pr.state}`
                        }]
                    });
                }
            }
            break;
        }

        case "close_pr": {
            if (context.pullRequestId) {
                await db
                    .update(schema.pullRequests)
                    .set({
                        state: "closed",
                        closedAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.pullRequests.id, context.pullRequestId));
            }
            break;
        }

        case "assign_user": {
            if (context.pullRequestId && action.params.user) {
                const username = action.params.user as string;
                // Find user
                const user = await db.query.users.findFirst({
                    where: eq(schema.users.username, username.replace("@", "")),
                });

                if (user) {
                    const { generateId } = await import("./utils");
                    await db.insert(schema.pullRequestAssignees).values({
                        id: generateId(),
                        pullRequestId: context.pullRequestId,
                        userId: user.id
                    }).onConflictDoNothing();
                }
            }
            break;
        }

        case "request_changes": {
            if (context.pullRequestId && action.params.body) {
                const { generateId } = await import("./utils");
                // Create a review
                await db.insert(schema.pullRequestReviews).values({
                    id: generateId(),
                    pullRequestId: context.pullRequestId,
                    reviewerId: context.userId || "system", // Or a bot user info if available
                    state: "changes_requested",
                    body: action.params.body as string,
                    submittedAt: new Date()
                });
            }
            break;
        }

        default:
            logger.warn("Unknown automation action", { type: action.type });
    }
}

/**
 * Create an automation rule
 */
export async function createAutomationRule(options: {
    repositoryId?: string;
    organizationId?: string;
    createdById: string;
    name: string;
    description?: string;
    trigger: AutomationTrigger;
    conditions?: AutomationCondition[];
    actions: AutomationAction[];
    priority?: number;
}) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const rule = {
        id: generateId(),
        repositoryId: options.repositoryId,
        organizationId: options.organizationId,
        createdById: options.createdById,
        name: options.name,
        description: options.description,
        trigger: options.trigger,
        conditions: options.conditions ? JSON.stringify(options.conditions) : null,
        actions: JSON.stringify(options.actions),
        isEnabled: true,
        priority: options.priority || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.insert(schema.automationRules).values(rule);

    return rule;
}

/**
 * Get automation rules for a repository
 */
export async function getAutomationRules(repositoryId: string) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    return db.query.automationRules.findMany({
        where: eq(schema.automationRules.repositoryId, repositoryId),
        orderBy: [desc(schema.automationRules.priority), desc(schema.automationRules.createdAt)],
    });
}

/**
 * Toggle automation rule enabled state
 */
export async function toggleAutomationRule(ruleId: string, enabled: boolean) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    await db
        .update(schema.automationRules)
        .set({
            isEnabled: enabled,
            updatedAt: new Date(),
        })
        .where(eq(schema.automationRules.id, ruleId));
}

/**
 * Delete an automation rule
 */
export async function deleteAutomationRule(ruleId: string) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    await db
        .delete(schema.automationRules)
        .where(eq(schema.automationRules.id, ruleId));
}
