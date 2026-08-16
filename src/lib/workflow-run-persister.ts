/**
 * Workflow Run Persister
 *
 * Bridges the in-process PipelineRunner to the DB-backed run model so that
 * push-triggered workflows are visible in the Actions UI and readable by
 * merge-queue CI gates:
 *
 *   1. Upserts the `workflows` registry row (repo + path)
 *   2. Pre-creates `workflowRuns` + `workflowJobs` rows with IDs that the
 *      engine will use (via `runId` / `jobIdByJobName`), so the engine's
 *      LogPersister (which inserts `workflowSteps` / `workflowLogs` against
 *      those job IDs) no longer hits FK failures
 *   3. Runs the workflow and syncs final run/job state
 *   4. Backfills skipped steps from the parsed config
 */
import { getDatabase, schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils";
import type { PipelineRunner, WorkflowConfig, JobConfig } from "./pipeline";
import { expandMatrix } from "./pipeline";

interface PersistOptions {
  repositoryId: string;
  repositoryPath: string;
  workflowPath: string;
  workflowName: string;
  config: WorkflowConfig;
  branch: string;
  commit: string;
  triggeredBy: string; // event name: push, pull_request, schedule...
  pusherId?: string;
  secrets?: Record<string, string>;
  variables?: Record<string, string>;
  inputs?: Record<string, string>;
}

/** Compute the engine's job-ID keys for a job, including matrix instances. */
function jobIdKeysFor(jobKey: string, job: JobConfig): string[] {
  const matrix = job.strategy?.matrix;
  if (matrix && typeof matrix === "object") {
    const combos = expandMatrix(matrix);
    return combos.map((_, i) => (i === 0 ? jobKey : `${jobKey}#${i}`));
  }
  return [jobKey];
}

export async function persistAndRunWorkflow(
  runner: PipelineRunner,
  options: PersistOptions,
): Promise<void> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // ── 1. Upsert the workflows registry row ──────────────────────────────
  let workflow = await db.query.workflows.findFirst({
    where: and(
      eq(schema.workflows.repositoryId, options.repositoryId),
      eq(schema.workflows.path, options.workflowPath),
    ),
  });
  if (!workflow) {
    const id = generateId();
    await db.insert(schema.workflows).values({
      id,
      repositoryId: options.repositoryId,
      name: options.workflowName,
      path: options.workflowPath,
    });
    workflow = {
      id,
      repositoryId: options.repositoryId,
      name: options.workflowName,
      path: options.workflowPath,
      state: "active",
      badgeUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  const workflowId = workflow.id;

  // ── 2. Compute run number + pre-create IDs ────────────────────────────
  const [lastRun] = await db
    .select({ max: sql<number>`coalesce(max(${schema.workflowRuns.runNumber}), 0)` })
    .from(schema.workflowRuns)
    .where(eq(schema.workflowRuns.repositoryId, options.repositoryId));
  const runNumber = Number(lastRun?.max || 0) + 1;

  const runId = generateId();
  const jobIdByJobName: Record<string, string> = {};
  for (const jobKey of Object.keys(options.config.jobs || {})) {
    for (const key of jobIdKeysFor(jobKey, (options.config.jobs || {})[jobKey])) {
      jobIdByJobName[key] = generateId();
    }
  }

  // ── 3. Insert run + job rows ──────────────────────────────────────────
  try {
    await db.insert(schema.workflowRuns).values({
      id: runId,
      workflowId,
      repositoryId: options.repositoryId,
      runNumber,
      runAttempt: 1,
      name: options.workflowName,
      displayTitle: options.workflowName,
      status: "queued",
      event: options.triggeredBy,
      headBranch: options.branch,
      headSha: options.commit,
      triggeredById: options.pusherId || null,
      startedAt: new Date(),
      workflowConfig: JSON.stringify(options.config),
    });

    const jobRows: any[] = [];
    for (const [jobKey, job] of Object.entries(options.config.jobs || {})) {
      for (const key of jobIdKeysFor(jobKey, job)) {
        jobRows.push({
          id: jobIdByJobName[key],
          runId,
          name: `${job.name || jobKey}${key.includes("#") ? ` (${key.split("#")[1]})` : ""}`,
          status: "queued",
          needs: Array.isArray(job.needs)
            ? JSON.stringify(job.needs)
            : job.needs
              ? JSON.stringify([job.needs])
              : null,
          matrix: key.includes("#") ? JSON.stringify({ index: Number(key.split("#")[1]) }) : null,
        });
      }
    }
    await db.insert(schema.workflowJobs).values(jobRows);
  } catch (err) {
    logger.error({ err, runId, repoId: options.repositoryId }, "Failed to create workflow run rows");
    // Non-fatal: the workflow still runs, it just won't be visible in the UI
  }

  // ── 4. Run the workflow with the pre-created IDs ──────────────────────
  const startTime = Date.now();
  let runResult: any = null;
  try {
    runResult = await runner.runWorkflow(options.config, {
      repositoryId: options.repositoryId,
      repositoryPath: options.repositoryPath,
      branch: options.branch,
      commit: options.commit,
      triggeredBy: options.triggeredBy,
      triggerEvent: options.triggeredBy,
      inputs: options.inputs,
      secrets: options.secrets,
      variables: options.variables,
      runId,
      jobIdByJobName,
    });
  } catch (err) {
    logger.error({ err, runId }, "Workflow execution crashed");
    runResult = {
      id: runId,
      status: "completed",
      conclusion: "failure",
      completedAt: new Date(),
      jobs: [],
    };
  }

  // ── 5. Sync final state from the engine result ────────────────────────
  const completedAt = new Date();
  try {
    const conclusion =
      runResult?.conclusion ||
      (runResult?.status === "completed" ? "success" : "failure");

    await db
      .update(schema.workflowRuns)
      .set({
        status: "completed",
        conclusion,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(schema.workflowRuns.id, runId));

    const jobResults = runResult?.jobs ?? [];
    for (const jobRun of jobResults) {
      const dbJobId = jobRun.id;
      const jobStatus =
        jobRun.status === "skipped"
          ? "completed"
          : jobRun.status === "completed" || jobRun.status === "in_progress"
            ? "completed"
            : "completed";
      await db
        .update(schema.workflowJobs)
        .set({
          status: jobStatus,
          conclusion: jobRun.conclusion || (jobStatus === "completed" ? "success" : "failure"),
          completedAt: jobRun.completedAt || completedAt,
          updatedAt: completedAt,
        })
        .where(eq(schema.workflowJobs.id, dbJobId));

      // Backfill steps that never executed (skipped) so the UI shows the
      // full job definition. Completed steps were written by LogPersister.
      if (jobRun.status === "skipped" && jobRun.steps.length === 0) {
        const jobKey = Object.keys(options.config.jobs || {}).find(
          (k) => jobIdByJobName[k] === dbJobId,
        );
        const jobConfig = jobKey ? (options.config.jobs || {})[jobKey] : undefined;
        const stepConfigs = jobConfig?.steps || [];
        if (stepConfigs.length > 0) {
          await db.insert(schema.workflowSteps).values(
            stepConfigs.map((step, i) => ({
              id: generateId(),
              jobId: dbJobId,
              number: i + 1,
              name: step.name || step.run || step.uses || `Step ${i + 1}`,
              status: "completed",
              conclusion: "skipped",
              uses: step.uses || null,
              run: step.run || null,
              shell: step.shell || null,
              env: step.env ? JSON.stringify(step.env) : null,
            })),
          );
        }
      }
    }

    // ── 6. Bridge to pullRequestChecks: make native runs visible as
    // check runs on any open PR whose head branch matches this run ─────
    try {
      const openPRs = await db.query.pullRequests.findMany({
        where: (t, { eq: eqFn, and: andFn }) =>
          andFn(eqFn(t.headBranch, options.branch), eqFn(t.state, "open")),
        columns: { id: true },
      });
      if (openPRs.length > 0 && jobResults.length > 0) {
        const checkRows: any[] = [];
        const jobRunMap = new Map<string, any>();
        for (const jobRun of jobResults) jobRunMap.set(jobRun.id, jobRun);
        for (const pr of openPRs) {
          for (const [jobKey, jobConfig] of Object.entries(options.config.jobs || {})) {
            const keys = jobIdKeysFor(jobKey, jobConfig);
            for (let i = 0; i < keys.length; i++) {
              const jobRun = jobRunMap.get(jobIdByJobName[keys[i]]);
              if (!jobRun) continue;
              const checkId = generateId();
              checkRows.push({
                id: checkId,
                pullRequestId: pr.id,
                name: `${options.workflowName} / ${jobConfig.name || jobKey}${i > 0 ? ` (${i})` : ""}`,
                status: "completed",
                conclusion:
                  jobRun.conclusion === "success" || jobRun.conclusion === "skipped"
                    ? "success"
                    : jobRun.conclusion || "failure",
                startedAt: jobRun.startedAt || new Date(),
                completedAt: jobRun.completedAt || completedAt,
                detailsUrl: null,
              });
            }
          }
        }
        if (checkRows.length > 0) {
          await db.insert(schema.pullRequestChecks).values(checkRows);
        }
      }
    } catch (err) {
      logger.error({ err, runId }, "Failed to bridge run to pull request checks");
    }

    logger.info({ runId, repoId: options.repositoryId, durationMs: Date.now() - startTime, conclusion }, "Workflow run persisted");
  } catch (err) {
    logger.error({ err, runId }, "Failed to sync workflow run final state");
  }
}
