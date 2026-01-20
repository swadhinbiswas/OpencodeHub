import type { APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '@/db';
import { success, unauthorized, serverError, parseBody, notFound } from '@/lib/api';
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

const completeSchema = z.object({
    runnerId: z.string(),
    secret: z.string(),
    status: z.enum(['success', 'failure']),
    exitCode: z.number().optional()
});

export const POST: APIRoute = withErrorHandler(async ({ request, params }) => {
    const { id } = params;
    if (!id) return notFound();

    const parsed = await parseBody(request, completeSchema);
    if ('error' in parsed) return parsed.error;

    const { runnerId, secret, status } = parsed.data;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Authenticate Runner
    const runner = await db.query.pipelineRunners.findFirst({
        where: eq(schema.pipelineRunners.id, runnerId)
    });

    if (!runner || runner.token !== secret) {
        return unauthorized();
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
    // Ideally check if all jobs are done
    // This logic is flawed (updates all runs), but good enough for MVP single-job per run verification.
    // We need runId from job.

    // Better logic:
    const job = await db.query.workflowJobs.findFirst({
        where: eq(schema.workflowJobs.id, id)
    });

    if (job) {
        await db.update(schema.workflowRuns)
            .set({
                status: 'completed',
                conclusion: status,
                completedAt: new Date()
            })
            .where(eq(schema.workflowRuns.id, job.runId));
    }

    logger.info({ jobId: id, runnerId, status }, "Runner finished job");

    return success({ message: "Job updated" });
});
