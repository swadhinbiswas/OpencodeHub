import type { APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from '@/db';
import { success, unauthorized, serverError, parseBody, notFound } from '@/lib/api';
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

const pollSchema = z.object({
    runnerId: z.string(),
    secret: z.string(),
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
    const parsed = await parseBody(request, pollSchema);
    if ('error' in parsed) return parsed.error;

    const { runnerId, secret } = parsed.data;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Authenticate Runner
    const runner = await db.query.pipelineRunners.findFirst({
        where: eq(schema.pipelineRunners.id, runnerId)
    });

    if (!runner || runner.token !== secret) {
        return unauthorized();
    }

    // Update Last Seen
    await db.update(schema.pipelineRunners)
        .set({ status: 'online', lastSeenAt: new Date() })
        .where(eq(schema.pipelineRunners.id, runnerId));

    // Find Queued Jobs for this Repository
    // 1. Find runs for repo
    // 2. Find queued jobs in those runs
    // For specific runner assignment, we would check runnerId on the job, but MVP picks any queued job for the repo.

    // Note: This is an inefficient query logic, ideally we join.
    // Simplifying: Get all jobs for this repo?
    // We need to join workflow_jobs -> workflow_runs -> repositories.
    // Or, since runner is tied to a repo, we look for jobs in runs of that repo.

    // Drizzle query using the relations would be best, but manual lookups are easier to reason about right now without complex joins in one go if not confident with Drizzle syntax.

    // Get active runs for repo
    const activeRuns = await db.query.workflowRuns.findMany({
        where: and(
            eq(schema.workflowRuns.repositoryId, runner.repositoryId!),
            eq(schema.workflowRuns.status, 'queued') // or in_progress but having queued jobs
        ),
        with: {
            jobs: {
                where: eq(schema.workflowJobs.status, 'queued'),
                limit: 1
            }
        },
        limit: 5 // check first 5 active runs
    });

    for (const run of activeRuns) {
        if (run.jobs.length > 0) {
            const job = run.jobs[0];

            // Claim Job
            await db.update(schema.workflowJobs)
                .set({
                    status: 'in_progress',
                    runnerId: runner.id,
                    startedAt: new Date()
                })
                .where(eq(schema.workflowJobs.id, job.id));

            await db.update(schema.workflowRuns)
                .set({ status: 'in_progress' })
                .where(eq(schema.workflowRuns.id, run.id));

            // Fetch steps or just send the command
            // Assuming simplified job structure where run command is in job definition for MVP? 
            // In schema, 'run' is in steps.
            const steps = await db.query.workflowSteps.findMany({
                where: eq(schema.workflowSteps.jobId, job.id),
                orderBy: (steps, { asc }) => [asc(steps.number)]
            });

            // Just send the first 'run' step for simplicity in MVP
            const runStep = steps.find(s => s.run);

            logger.info({ runnerId, jobId: job.id, runId: run.id }, "Job claimed by runner");

            return success({
                id: job.id,
                name: job.name,
                stepName: runStep?.name || 'Execute',
                run: runStep?.run || 'echo "No run command found"'
            });
        }
    }

    // No job found
    // Return 404 to indicate no content? Or 204?
    // Client treats 404 as "no job".
    return notFound("No job");
});
