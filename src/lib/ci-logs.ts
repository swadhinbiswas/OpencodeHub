/**
 * CI Log Persistence
 * Buffers and flushes workflow logs to database + filesystem
 */

import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import fs from "fs/promises";
import path from "path";
import { logger } from "./logger";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogEntry {
  jobId: string;
  stepId?: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  lineNumber: number;
}

interface StepRecord {
  id: string;
  jobId: string;
  number: number;
  name: string;
  status: string;
  conclusion?: string;
  uses?: string;
  run?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// ─── Log Persister ───────────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BUFFER_SIZE = 500;

export class LogPersister {
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private lineCounter = 0;
  private logDir: string;

  constructor(
    private runId: string,
    logBaseDir: string = "./data/actions/logs",
  ) {
    this.logDir = path.join(logBaseDir, runId);
    this.startFlushTimer();
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        logger.error(
          { error: err, runId: this.runId },
          "Failed to flush CI logs",
        );
      });
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * Add a log line to the buffer
   */
  addLog(
    jobId: string,
    stepId: string | undefined,
    message: string,
    level: "info" | "error" = "info",
  ) {
    this.lineCounter++;
    this.buffer.push({
      jobId,
      stepId,
      level,
      message,
      lineNumber: this.lineCounter,
    });

    // Auto-flush if buffer is large
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.flush().catch(() => {});
    }
  }

  /**
   * Persist a step record to the database
   */
  async persistStep(step: StepRecord): Promise<void> {
    try {
      const db = getDatabase();
      await (db as NodePgDatabase<typeof schema>)
        .insert(schema.workflowSteps)
        .values({
          id: step.id,
          jobId: step.jobId,
          number: step.number,
          name: step.name,
          status: step.status,
          conclusion: step.conclusion ?? null,
          uses: step.uses ?? null,
          run: step.run ?? null,
          startedAt: step.startedAt ?? null,
          completedAt: step.completedAt ?? null,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.workflowSteps.id,
          set: {
            status: step.status,
            conclusion: step.conclusion ?? null,
            startedAt: step.startedAt ?? null,
            completedAt: step.completedAt ?? null,
          },
        });
    } catch (error) {
      logger.error({ error, stepId: step.id }, "Failed to persist step record");
    }
  }

  /**
   * Flush buffered logs to database and filesystem
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = this.buffer.splice(0); // drain buffer

    // 1. Write to filesystem (append mode) for durability
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      const logLines =
        entries
          .map((e) => {
            const ts = new Date().toISOString();
            return `[${ts}] [${e.level.toUpperCase()}] [job:${e.jobId}${e.stepId ? `:step:${e.stepId}` : ""}] ${e.message}`;
          })
          .join("\n") + "\n";
      await fs.appendFile(path.join(this.logDir, "run.log"), logLines);
    } catch (error) {
      logger.error(
        { error, runId: this.runId },
        "Failed to write CI logs to filesystem",
      );
    }

    // 2. Batch insert into database
    try {
      const db = getDatabase();
      const values = entries.map((e) => ({
        id: crypto.randomUUID(),
        jobId: e.jobId,
        stepId: e.stepId ?? null,
        logLevel: e.level,
        message: e.message,
        timestamp: new Date().toISOString(),
        lineNumber: e.lineNumber,
        createdAt: new Date(),
      }));

      // Insert in chunks of 100 to avoid oversized queries
      for (let i = 0; i < values.length; i += 100) {
        const chunk = values.slice(i, i + 100);
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.workflowLogs).values(chunk);
      }
    } catch (error) {
      logger.error(
        { error, runId: this.runId },
        "Failed to write CI logs to database",
      );
    }
  }

  /**
   * Final cleanup — flush remaining logs and stop timer
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

// ─── Log Retrieval ───────────────────────────────────────────────────────────

/**
 * Get logs for a workflow run from the database
 */
export async function getRunLogs(runId: string, jobId?: string) {
  const db = getDatabase();

  // Get all jobs for this run
  const jobs = await db.query.workflowJobs.findMany({
    where: eq(schema.workflowJobs.runId, runId),
  });

  if (jobs.length === 0) return [];

  const targetJobIds = jobId ? [jobId] : jobs.map((j) => j.id);

  const { inArray } = await import("drizzle-orm");
  const logs = await db.query.workflowLogs.findMany({
    where: inArray(schema.workflowLogs.jobId, targetJobIds),
    orderBy: (logs, { asc }) => [asc(logs.lineNumber)],
  });

  return logs;
}

/**
 * Get logs from filesystem (fallback if DB is unavailable)
 */
export async function getRunLogsFromFile(
  runId: string,
  logBaseDir = "./data/actions/logs",
): Promise<string | null> {
  const logFile = path.join(logBaseDir, runId, "run.log");
  try {
    return await fs.readFile(logFile, "utf-8");
  } catch {
    return null;
  }
}
