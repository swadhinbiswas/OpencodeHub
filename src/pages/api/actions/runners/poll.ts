import type { APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from 'zod';
import { eq, and, inArray } from 'drizzle-orm';
import { getDatabase, schema } from '@/db';
import { success, unauthorized, parseBody, notFound } from '@/lib/api';
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isLegacyPlainSecret, hashRunnerSecret, verifyRunnerSecret } from "@/lib/runner-secrets";
import path from 'node:path';

const pollSchema = z.object({
    runnerId: z.string(),
    secret: z.string(),
});

/**
 * Resolve a `uses:` step into executable `run` lines server-side so the
 * polling runner (which only executes `run:` scripts) can handle action
 * steps. Composite actions and actions/checkout are supported; everything
 * else fails fast with a clear message instead of hanging in "queued".
 */
async function ensureStepRun(step: any): Promise<string> {
    if (step.run) return step.run;
    if (!step.uses) return "echo 'No run command found'";

    try {
        const db = getDatabase() as NodePgDatabase<typeof schema>;
        const { resolveActionStep } = await import("@/lib/action-resolver");
        const { resolveRepoPath } = await import("@/lib/git-storage");
        const job = await db.query.workflowJobs.findFirst({
            where: eq(schema.workflowJobs.id, step.jobId),
        });
        const run = job ? await db.query.workflowRuns.findFirst({ where: eq(schema.workflowRuns.id, job.runId) }) : null;
        const repository = run ? await db.query.repositories.findFirst({
            where: eq(schema.repositories.id, run.repositoryId),
            with: { owner: true },
        }) : null;

        let repositoryPath = "";
        if (repository) {
            try {
                repositoryPath = await resolveRepoPath(repository.diskPath);
            } catch {
                repositoryPath = "";
            }
        }

        const siteUrl = process.env.SITE_URL || "http://localhost:4321";
        const repositoryUrl = repository
            ? `${siteUrl}/${repository.owner?.username || "owner"}/${repository.name}.git`
            : undefined;

        let withInputs: Record<string, string> = {};
        try {
            withInputs = step.with ? JSON.parse(step.with) : {};
        } catch {
            withInputs = {};
        }

        const resolved = await resolveActionStep({
            uses: step.uses,
            withInputs,
            repositoryPath,
            repositoryUrl,
            ref: run?.headBranch || undefined,
            cacheDir: path.join(process.cwd(), "data", "runner", "cache"),
        });
        return resolved.run;
    } catch (err) {
        logger.error({ err, uses: step.uses }, "Action resolution failed");
        return `echo '::error::Failed to resolve action ${step.uses}' && exit 1`;
    }
}

async function claimAndDispatchStep(
    db: NodePgDatabase<typeof schema>,
    jobId: string,
): Promise<{ step: any; run: string } | null> {
    const steps = await db.query.workflowSteps.findMany({
        where: eq(schema.workflowSteps.jobId, jobId),
        orderBy: (steps, { asc }) => [asc(steps.number)],
    });
    const nextStep = steps.find((s) => s.status === "queued");
    if (!nextStep) return null;

    const run = await ensureStepRun(nextStep);

    const claimed = await db.update(schema.workflowSteps)
        .set({ status: "in_progress", startedAt: new Date(), run })
        .where(and(eq(schema.workflowSteps.id, nextStep.id), eq(schema.workflowSteps.status, "queued")))
        .returning({ id: schema.workflowSteps.id });

    if (claimed.length === 0) return null;
    return { step: nextStep, run };
}

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

        const dispatched = await claimAndDispatchStep(db, job.id);
        if (!dispatched) continue;

        logger.info({ runnerId, jobId: job.id, stepId: dispatched.step.id }, "Dispatched queued step for in-progress job");
        return success({
            id: job.id,
            name: job.name,
            stepId: dispatched.step.id,
            stepName: dispatched.step.name || "Execute",
            run: dispatched.run,
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

            // Resolve the first queued step (including `uses:` steps) and
            // dispatch it to the runner.
            const dispatched = await claimAndDispatchStep(db, job.id);

            logger.info({ runnerId, jobId: job.id, runId: run.id }, "Job claimed by runner");

            return success({
                id: job.id,
                name: job.name,
                stepId: dispatched?.step.id || null,
                stepName: dispatched?.step.name || 'Execute',
                run: dispatched?.run || 'echo "No run command found"'
            });
        }
    }

    // No job found
    // Return 404 to indicate no content? Or 204?
    // Client treats 404 as "no job".
    return notFound("No job");
});
