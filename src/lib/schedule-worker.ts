/**
 * Scheduled Workflow Scheduler (WS1-08)
 *
 * Consumes `schedule:` triggers from `.github/workflows/*.yml` files:
 *
 *   1. Walks the `workflows` registry (populated by the run persister on
 *      every push — no full-repo scans needed)
 *   2. Reads the latest persisted `workflowConfig` JSON from workflowRuns
 *   3. Evaluates each `schedule:` cron expression with cron-parser
 *   4. When due, triggers the workflow via persistAndRunWorkflow and
 *      records lastRunAt/nextRunAt in `scheduledWorkflows`
 *
 * Runs inside the worker process (`scripts/worker.ts`).
 */
import { getDatabase, schema } from "@/db";
import { eq, and, desc, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils";
import { parseExpression } from "cron-parser";

export interface ScheduleResult {
  due: number;
  triggered: number;
  failed: number;
  checked: number;
}

const SCHEDULE_TZ = process.env.WORKFLOW_SCHEDULE_TZ || "UTC";

export async function runScheduledWorkflows(
  runner: import("./pipeline").PipelineRunner,
): Promise<ScheduleResult> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const result: ScheduleResult = { due: 0, triggered: 0, failed: 0, checked: 0 };
  const now = new Date();

  let workflows: any[] = [];
  try {
    workflows = await db.query.workflows.findMany({
      where: eq(schema.workflows.state, "active"),
    });
  } catch (err) {
    logger.error({ err }, "Scheduler: failed to list workflows");
    return result;
  }

  for (const workflow of workflows) {
    // Read the latest persisted config (no git read needed)
    const latestRun = await db.query.workflowRuns.findFirst({
      where: eq(schema.workflowRuns.workflowId, workflow.id),
      orderBy: [desc(schema.workflowRuns.runNumber)],
    });
    if (!latestRun?.workflowConfig) continue;

    let config: any;
    try {
      config = JSON.parse(latestRun.workflowConfig);
    } catch {
      continue;
    }

    const scheduleTriggers =
      typeof config?.on === "object" && Array.isArray(config?.on?.schedule)
        ? config.on.schedule
        : [];
    if (scheduleTriggers.length === 0) continue;

    const repo = await db.query.repositories.findFirst({
      where: eq(schema.repositories.id, latestRun.repositoryId),
    });
    if (!repo) continue;

    for (const trigger of scheduleTriggers) {
      const cronExpr = trigger.cron;
      if (!cronExpr) continue;
      result.checked++;

      // Track per (workflow, expression) in scheduledWorkflows
      let sched = await db.query.scheduledWorkflows.findFirst({
        where: and(
          eq(schema.scheduledWorkflows.workflowId, workflow.id),
          eq(schema.scheduledWorkflows.cronExpression, cronExpr),
        ),
      });

      let nextRunAt: Date | null = null;
      try {
        const parsed = parseExpression(cronExpr, { tz: SCHEDULE_TZ });
        nextRunAt = parsed.next().toDate();
      } catch (err) {
        logger.error({ err, cron: cronExpr, workflow: workflow.path }, "Scheduler: invalid cron expression");
        continue;
      }

      const lastRunAt = sched?.lastRunAt ? new Date(sched.lastRunAt) : null;
      const isDue =
        !lastRunAt ||
        (nextRunAt !== null && now.getTime() >= lastRunAt.getTime() + 30_000 && now.getTime() >= nextRunAt.getTime());

      if (!isDue) continue;
      result.due++;

      // Trigger the run
      try {
        const { persistAndRunWorkflow } = await import("./workflow-run-persister");
        const { resolveRepoPath } = await import("./git-storage");
        const repoPath = await resolveRepoPath(repo.diskPath);
        await persistAndRunWorkflow(runner, {
          repositoryId: repo.id,
          repositoryPath: repoPath,
          workflowPath: workflow.path,
          workflowName: workflow.name,
          config,
          branch: repo.defaultBranch || "main",
          commit: latestRun.headSha,
          triggeredBy: "schedule",
        });
        result.triggered++;
      } catch (err) {
        logger.error({ err, workflow: workflow.path, cron: cronExpr }, "Scheduler: run trigger failed");
        result.failed++;
      }

      // Record last/next run times
      const values = {
        lastRunAt: new Date(),
        nextRunAt,
        updatedAt: new Date(),
      };
      if (sched) {
        await db.update(schema.scheduledWorkflows).set(values).where(eq(schema.scheduledWorkflows.id, sched.id));
      } else {
        await db.insert(schema.scheduledWorkflows).values({
          id: generateId(),
          workflowId: workflow.id,
          cronExpression: cronExpr,
          timezone: SCHEDULE_TZ,
          isEnabled: true,
          ...values,
        });
      }
    }
  }

  if (result.triggered > 0) {
    logger.info(result, "Scheduled workflows triggered");
  }
  return result;
}
