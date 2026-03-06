import type { APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from 'zod';
import { eq, and, inArray } from 'drizzle-orm';
import { getDatabase, schema } from '@/db';
import { success, unauthorized, parseBody, notFound } from '@/lib/api';
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isLegacyPlainSecret, hashRunnerSecret, verifyRunnerSecret } from "@/lib/runner-secrets";

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

    if (!runner || !verifyRunnerSecret(runner.token, secret)) {
        return unauthorized();
    }

    if (isLegacyPlainSecret(runner.token)) {
        await db
            .update(schema.pipelineRunners)
            .set({ token: hashRunnerSecret(secret) })
            .where(eq(schema.pipelineRunners.id, runnerId));
    }

    // Update Last Seen
    await db.update(schema.pipelineRunners)
        .set({ status: 'online', lastSeenAt: new Date() })
        .where(eq(schema.pipelineRunners.id, runnerId));

    // First, continue any in-progress job already assigned to this runner by dispatching
    // the next queued executable step.
    const inProgressJobs = await db.query.workflowJobs.findMany({
        where: and(
            eq(schema.workflowJobs.runnerId, runner.id),
            eq(schema.workflowJobs.status, "in_progress")
        ),
        with: {
            run: true,
        },
        limit: 5,
    });

    for (const job of inProgressJobs) {
        if (!job.run || job.run.repositoryId !== runner.repositoryId) continue;

        const steps = await db.query.workflowSteps.findMany({
            where: eq(schema.workflowSteps.jobId, job.id),
            orderBy: (steps, { asc }) => [asc(steps.number)]
        });

        const nextStep = steps.find((step) => step.status === "queued" && !!step.run);
        if (!nextStep) {
            continue;
        }

        const claimedStep = await db.update(schema.workflowSteps)
            .set({ status: "in_progress", startedAt: new Date() })
            .where(and(eq(schema.workflowSteps.id, nextStep.id), eq(schema.workflowSteps.status, "queued")))
            .returning({ id: schema.workflowSteps.id });

        if (claimedStep.length === 0) {
            continue;
        }

        logger.info({ runnerId, jobId: job.id, stepId: nextStep.id }, "Dispatched queued step for in-progress job");
        return success({
            id: job.id,
            name: job.name,
            stepId: nextStep.id,
            stepName: nextStep.name || "Execute",
            run: nextStep.run || "echo \"No run command found\"",
        });
    }

    // Find new queued jobs for this repository.
    const activeRuns = await db.query.workflowRuns.findMany({
        where: and(
            eq(schema.workflowRuns.repositoryId, runner.repositoryId!),
            inArray(schema.workflowRuns.status, ['queued', 'in_progress'])
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

            // Claim job only if it is still queued to avoid race conditions between runners.
            const claim = await db.update(schema.workflowJobs)
                .set({
                    status: 'in_progress',
                    runnerId: runner.id,
                    startedAt: new Date()
                })
                .where(and(eq(schema.workflowJobs.id, job.id), eq(schema.workflowJobs.status, 'queued')))
                .returning({ id: schema.workflowJobs.id });

            if (claim.length === 0) {
                continue;
            }

            await db.update(schema.workflowRuns)
                .set({ status: 'in_progress' })
                .where(eq(schema.workflowRuns.id, run.id));

            // Fetch steps and provide the first executable run step to the runner.
            const steps = await db.query.workflowSteps.findMany({
                where: eq(schema.workflowSteps.jobId, job.id),
                orderBy: (steps, { asc }) => [asc(steps.number)]
            });

            const runStep = steps.find((s) => s.status === "queued" && !!s.run);

            if (runStep) {
                await db.update(schema.workflowSteps)
                    .set({ status: "in_progress", startedAt: new Date() })
                    .where(and(eq(schema.workflowSteps.id, runStep.id), eq(schema.workflowSteps.status, "queued")));
            }

            logger.info({ runnerId, jobId: job.id, runId: run.id }, "Job claimed by runner");

            return success({
                id: job.id,
                name: job.name,
                stepId: runStep?.id || null,
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
