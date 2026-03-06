import type { APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { getDatabase, schema } from '@/db';
import { success, unauthorized, parseBody, notFound } from '@/lib/api';
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import crypto from 'node:crypto';
import { isLegacyPlainSecret, hashRunnerSecret, verifyRunnerSecret } from "@/lib/runner-secrets";

const completeSchema = z.object({
    runnerId: z.string(),
    secret: z.string(),
    stepId: z.string().optional(),
    status: z.enum(['success', 'failure']),
    exitCode: z.number().optional(),
    logs: z.string().optional()
});

export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id } = params;
    if (!id) return notFound();

    const parsed = await parseBody(request, completeSchema);
    if ('error' in parsed) return parsed.error;

    const { runnerId, secret, stepId, status, logs } = parsed.data;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Authenticate Runner
    const runner = await db.query.pipelineRunners.findFirst({
        where: eq(schema.pipelineRunners.id, runnerId)
    });

    if (!runner || !verifyRunnerSecret(runner.token, secret)) {
        return unauthorized();
    }

    if (isLegacyPlainSecret(runner.token)) {
        await db
            .update(schema.pipelineRunners)
            .set({ token: hashRunnerSecret(secret) })
            .where(eq(schema.pipelineRunners.id, runnerId));
    }

    const job = await db.query.workflowJobs.findFirst({
        where: eq(schema.workflowJobs.id, id),
        with: {
            run: true,
        },
    });
    if (!job || !job.run) return notFound("Job not found");
    if (job.run.repositoryId !== runner.repositoryId) return unauthorized();
    if (job.runnerId && job.runnerId !== runner.id) return unauthorized();

    let logLineOffset = 0;
    const maxLineResult = await db
        .select({ maxLine: sql<number>`max(${schema.workflowLogs.lineNumber})` })
        .from(schema.workflowLogs)
        .where(eq(schema.workflowLogs.jobId, id));
    if (maxLineResult.length > 0 && Number.isFinite(Number(maxLineResult[0].maxLine))) {
        logLineOffset = Number(maxLineResult[0].maxLine) || 0;
    }

    // Save Logs
    if (logs) {
        const lines = logs.split('\n');
        const logEntries = lines.map((line, index) => ({
            id: crypto.randomUUID(),
            jobId: id,
            stepId: stepId || null,
            message: line,
            timestamp: new Date().toISOString(),
            lineNumber: logLineOffset + index + 1
        }));

        if (logEntries.length > 0) {
            // Split into chunks if too large (e.g. 1000 lines)
            const chunkSize = 1000;
            for (let i = 0; i < logEntries.length; i += chunkSize) {
                await db.insert(schema.workflowLogs).values(logEntries.slice(i, i + chunkSize));
            }
        }
    }

    if (stepId) {
        const updatedStep = await db.update(schema.workflowSteps)
            .set({
                status: "completed",
                conclusion: status,
                completedAt: new Date(),
            })
            .where(and(
                eq(schema.workflowSteps.id, stepId),
                eq(schema.workflowSteps.jobId, id),
                eq(schema.workflowSteps.status, "in_progress")
            ))
            .returning({ id: schema.workflowSteps.id });

        if (updatedStep.length === 0) {
            return notFound("Step not found or already completed");
        }
    }

    const jobSteps = await db.query.workflowSteps.findMany({
        where: eq(schema.workflowSteps.jobId, id),
        orderBy: (steps, { asc }) => [asc(steps.number)]
    });
    const executableSteps = jobSteps.filter((s) => !!s.run);
    const hasRemainingExecutableSteps = executableSteps.some(
        (s) => s.status === "queued" || s.status === "in_progress"
    );

    let jobCompleted = false;
    if (status === "failure" || !hasRemainingExecutableSteps || executableSteps.length === 0) {
        await db.update(schema.workflowJobs)
            .set({
                status: 'completed',
                conclusion: status === "failure" ? "failure" : "success",
                completedAt: new Date()
            })
            .where(and(eq(schema.workflowJobs.id, id), eq(schema.workflowJobs.runnerId, runner.id)));
        jobCompleted = true;
    } else {
        await db.update(schema.workflowJobs)
            .set({
                status: "in_progress",
            })
            .where(eq(schema.workflowJobs.id, id));
    }

    // Update run status after checking sibling jobs when current job is completed.
    if (jobCompleted) {
        const allJobs = await db.query.workflowJobs.findMany({
            where: eq(schema.workflowJobs.runId, job.runId)
        });

        const allCompleted = allJobs.every((j) => j.status === "completed");
        const anyFailed = allJobs.some((j) => j.conclusion === "failure");

        if (allCompleted) {
            await db.update(schema.workflowRuns)
                .set({
                    status: 'completed',
                    conclusion: anyFailed ? 'failure' : 'success',
                    completedAt: new Date()
                })
                .where(eq(schema.workflowRuns.id, job.runId));
        }
    }

    logger.info({ jobId: id, runnerId, stepId, status, jobCompleted }, "Runner reported step/job completion");

    return success({ message: "Job updated", jobCompleted });
});
