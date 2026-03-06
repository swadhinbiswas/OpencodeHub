import type { APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from 'zod';
import { getDatabase, schema } from "@/db";
import { success, unauthorized, serverError, parseBody, notFound } from '@/lib/api';
import { getUserFromRequest } from '@/lib/auth';
import { eq, and, desc } from "drizzle-orm";
import crypto from 'node:crypto';
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { canWriteRepo } from "@/lib/permissions";

const triggerSchema = z.object({
    repositoryId: z.string()
});

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) return unauthorized();

    const parsed = await parseBody(request, triggerSchema);
    if ('error' in parsed) return parsed.error;

    const { repositoryId } = parsed.data;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Fetch Repo for Default Branch
    const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repositoryId)
    });

    if (!repo) return notFound("Repository not found");
    if (!(await canWriteRepo(tokenPayload.userId, repo, { isAdmin: tokenPayload.isAdmin }))) {
        return unauthorized("Insufficient permissions");
    }

    // Reuse existing workflow definition if present.
    let workflow = await db.query.workflows.findFirst({
        where: and(
            eq(schema.workflows.repositoryId, repositoryId),
            eq(schema.workflows.path, ".github/workflows/test.yml")
        )
    });
    if (!workflow) {
        const workflowId = crypto.randomUUID();
        await db.insert(schema.workflows).values({
            id: workflowId,
            repositoryId,
            name: "Test Workflow",
            path: ".github/workflows/test.yml",
            state: "active"
        });
        workflow = await db.query.workflows.findFirst({
            where: eq(schema.workflows.id, workflowId)
        });
    }
    if (!workflow) return serverError("Failed to initialize workflow");

    const latestRun = await db.query.workflowRuns.findFirst({
        where: eq(schema.workflowRuns.workflowId, workflow.id),
        orderBy: [desc(schema.workflowRuns.runNumber)]
    });
    const nextRunNumber = (latestRun?.runNumber ?? 0) + 1;

    // Create Run
    const runId = crypto.randomUUID();
    await db.insert(schema.workflowRuns).values({
        id: runId,
        workflowId: workflow.id,
        repositoryId,
        runNumber: nextRunNumber,
        name: "Manual Test Run",
        status: "queued",
        event: "workflow_dispatch",
        headSha: "HEAD",
        headBranch: repo.defaultBranch,
        triggeredById: tokenPayload.userId
    });

    // Create Job
    const jobId = crypto.randomUUID();
    await db.insert(schema.workflowJobs).values({
        id: jobId,
        runId,
        name: "test-job",
        status: "queued"
    });

    // Create Step
    await db.insert(schema.workflowSteps).values({
        id: crypto.randomUUID(),
        jobId,
        number: 1,
        name: "Run Echo",
        run: "echo 'Hello from OpenCodeHub Self-Hosted Runner!' && uptime",
        status: "queued"
    });

    logger.info({ userId: tokenPayload.userId, repositoryId, runId }, "Workflow run triggered manually");

    return success({ message: "Test job queued", jobId });
});
