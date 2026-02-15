/**
 * PR Checks Library
 * Manages CI check status for pull requests
 */

import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { generateId } from "./utils";
import { processAutoMerge } from "./auto-merge";

export interface CheckRunInput {
    name: string;
    headSha: string;
    status: "queued" | "in_progress" | "completed";
    conclusion?: "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required";
    externalId?: string;
    detailsUrl?: string;
    output?: {
        title: string;
        summary: string;
        text?: string;
    };
}

export interface CheckSummary {
    total: number;
    passed: number;
    failed: number;
    pending: number;
    neutral: number;
    allPassing: boolean;
}

/**
 * Create or update a check run for a PR
 */
export async function upsertCheckRun(
    prId: string,
    check: CheckRunInput
): Promise<typeof schema.pullRequestChecks.$inferSelect> {
    const db = getDatabase();

    // Find existing check by name and PR
    const existing = await db.query.pullRequestChecks.findFirst({
        where: and(
            eq(schema.pullRequestChecks.pullRequestId, prId),
            eq(schema.pullRequestChecks.name, check.name)
        ),
    });

    const checkData = {
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        headSha: check.headSha,
        externalId: check.externalId ?? null,
        detailsUrl: check.detailsUrl ?? null,
        output: check.output ? JSON.stringify(check.output) : null,
        startedAt: check.status === "in_progress" ? new Date() : null,
    };

    if (existing) {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.pullRequestChecks)
            .set(checkData)
            .where(eq(schema.pullRequestChecks.id, existing.id));

        logger.info({ prId, checkName: check.name, status: check.status }, "Check updated");

        // If check completed, try auto-merge
        if (check.status === "completed") {
            await processAutoMerge(prId);
        }

        return { ...existing, ...checkData, conclusion: checkData.conclusion || null };
    } else {
        const newCheck = {
            id: generateId(),
            pullRequestId: prId,
            ...checkData,
        };

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.pullRequestChecks).values(newCheck);

        logger.info({ prId, checkName: check.name }, "Check created");

        return newCheck as typeof schema.pullRequestChecks.$inferSelect;
    }
}

/**
 * Get all checks for a PR
 */
export async function getCheckRuns(prId: string) {
    const db = getDatabase();

    return db.query.pullRequestChecks.findMany({
        where: eq(schema.pullRequestChecks.pullRequestId, prId),
    });
}

/**
 * Get check summary for a PR
 */
export async function getCheckSummary(prId: string): Promise<CheckSummary> {
    const checks = await getCheckRuns(prId);

    const passed = checks.filter(c => c.conclusion === "success").length;
    const failed = checks.filter(c =>
        c.conclusion === "failure" ||
        c.conclusion === "cancelled" ||
        c.conclusion === "timed_out"
    ).length;
    const pending = checks.filter(c => c.status !== "completed").length;
    const neutral = checks.filter(c => c.conclusion === "neutral").length;

    return {
        total: checks.length,
        passed,
        failed,
        pending,
        neutral,
        allPassing: failed === 0 && pending === 0,
    };
}

/**
 * Check if all required checks pass
 */
export async function areRequiredChecksPassing(
    prId: string,
    requiredChecks: string[]
): Promise<{ passing: boolean; missing: string[]; failing: string[] }> {
    const checks = await getCheckRuns(prId);
    const checkMap = new Map(checks.map(c => [c.name, c]));

    const missing: string[] = [];
    const failing: string[] = [];

    for (const required of requiredChecks) {
        const check = checkMap.get(required);
        if (!check) {
            missing.push(required);
        } else if (check.status !== "completed" || check.conclusion !== "success") {
            failing.push(required);
        }
    }

    return {
        passing: missing.length === 0 && failing.length === 0,
        missing,
        failing,
    };
}

/**
 * Update PR mergeable state based on checks
 */
export async function updateMergeableState(prId: string): Promise<void> {
    const db = getDatabase();
    const summary = await getCheckSummary(prId);

    let mergeableState: string;
    if (summary.pending > 0) {
        mergeableState = "unknown";
    } else if (summary.failed > 0) {
        mergeableState = "blocked";
    } else {
        mergeableState = "clean";
    }

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.update(schema.pullRequests)
        .set({
            mergeableState,
            updatedAt: new Date(),
        })
        .where(eq(schema.pullRequests.id, prId));
}

/**
 * Sync checks from a workflow run
 */
export async function syncChecksFromWorkflow(
    prId: string,
    workflowRunId: string
): Promise<void> {
    const db = getDatabase();

    // Get workflow jobs
    const jobs = await db.query.workflowJobs.findMany({
        where: eq(schema.workflowJobs.runId, workflowRunId),
    });

    // Get PR for head SHA
    const pr = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.id, prId),
    });

    if (!pr) return;

    // Create/update checks from jobs
    for (const job of jobs) {
        await upsertCheckRun(prId, {
            name: job.name,
            headSha: pr.headSha,
            status: mapJobStatus(job.status),
            conclusion: mapJobConclusion(job.conclusion),
            detailsUrl: `/workflows/${workflowRunId}/jobs/${job.id}`,
        });
    }

    // Update mergeable state
    await updateMergeableState(prId);
}

function mapJobStatus(status: string | null): "queued" | "in_progress" | "completed" {
    switch (status) {
        case "queued":
        case "waiting":
            return "queued";
        case "in_progress":
            return "in_progress";
        default:
            return "completed";
    }
}

function mapJobConclusion(
    conclusion: string | null
): "success" | "failure" | "neutral" | "cancelled" | undefined {
    switch (conclusion) {
        case "success":
            return "success";
        case "failure":
            return "failure";
        case "cancelled":
            return "cancelled";
        case "skipped":
            return "neutral";
        default:
            return undefined;
    }
}
