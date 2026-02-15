import type { APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '@/db';
import { success, unauthorized, serverError, parseBody, notFound } from '@/lib/api';
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import crypto from 'node:crypto';

const completeSchema = z.object({
    runnerId: z.string(),
    secret: z.string(),
    status: z.enum(['success', 'failure']),
    exitCode: z.number().optional(),
    logs: z.string().optional()
});

export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id } = params;
    if (!id) return notFound();

    const parsed = await parseBody(request, completeSchema);
    if ('error' in parsed) return parsed.error;

    const { runnerId, secret, status, logs } = parsed.data;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Authenticate Runner
    const runner = await db.query.pipelineRunners.findFirst({
        where: eq(schema.pipelineRunners.id, runnerId)
    });

    if (!runner || runner.token !== secret) {
        return unauthorized();
    }

    // Save Logs
    if (logs) {
        const lines = logs.split('\n');
        // Batch insert logs
        // Note: Drizzle insert many
        const logEntries = lines.map((line, index) => ({
            id: crypto.randomUUID(),
            jobId: id,
            message: line,
            timestamp: new Date().toISOString(),
            lineNumber: index + 1
        }));

        if (logEntries.length > 0) {
            // Split into chunks if too large (e.g. 1000 lines)
            const chunkSize = 1000;
            for (let i = 0; i < logEntries.length; i += chunkSize) {
                await db.insert(schema.workflowLogs).values(logEntries.slice(i, i + chunkSize));
            }
        }
    }

    // Update Job Status
    await db.update(schema.workflowJobs)
        .set({
            status: 'completed',
            conclusion: status,
            completedAt: new Date()
        })
        .where(eq(schema.workflowJobs.id, id));

    // Update Run status if all jobs completed (Simplified: just complete run)
    const job = await db.query.workflowJobs.findFirst({
        where: eq(schema.workflowJobs.id, id)
    });

    if (job) {
        // Here we ideally check if *all* jobs are done.
        // For MVP "Pro" fix, let's at least check siblings.
        const allJobs = await db.query.workflowJobs.findMany({
            where: eq(schema.workflowJobs.runId, job.runId)
        });

        const allCompleted = allJobs.every(j => j.id === id ? true : j.status === 'completed');
        const anyFailed = allJobs.some(j => j.id === id ? status === 'failure' : j.conclusion === 'failure');

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

    logger.info({ jobId: id, runnerId, status }, "Runner finished job");

    return success({ message: "Job updated" });
});
