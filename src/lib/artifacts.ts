/**
 * CI Artifacts Library
 * Upload, download, and manage workflow run artifacts
 */

import { getDatabase, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createGunzip, createGzip } from "zlib";
import { logger } from "./logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Artifact {
  id: string;
  runId: string;
  jobId: string | null;
  name: string;
  sizeBytes: number;
  mimeType: string | null;
  downloadCount: number;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface UploadArtifactOptions {
  runId: string;
  jobId?: string;
  name: string;
  /** Absolute path to the file or directory to upload */
  sourcePath: string;
  mimeType?: string;
  /** Artifact retention in days (default: 90) */
  retentionDays?: number;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const ARTIFACTS_BASE_DIR =
  process.env.RUNNER_ARTIFACTS_DIR || "./data/actions/artifacts";
const DEFAULT_RETENTION_DAYS = 90;
const MAX_ARTIFACT_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Upload an artifact from a workflow run.
 * Stores the file compressed (gzip) on filesystem and records metadata in DB.
 */
export async function uploadArtifact(
  options: UploadArtifactOptions,
): Promise<Artifact> {
  const { runId, jobId, name, sourcePath, mimeType, retentionDays } = options;
  const id = crypto.randomUUID();

  // Validate source exists
  const stat = await fs.stat(sourcePath);
  if (stat.size > MAX_ARTIFACT_SIZE_BYTES) {
    throw new Error(
      `Artifact "${name}" exceeds maximum size of ${MAX_ARTIFACT_SIZE_BYTES / (1024 * 1024)}MB`,
    );
  }

  // Calculate expiration
  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() + (retentionDays ?? DEFAULT_RETENTION_DAYS),
  );

  // Determine storage path: artifacts/<runId>/<artifactId>/<name>.gz
  const artifactDir = path.join(ARTIFACTS_BASE_DIR, runId, id);
  await fs.mkdir(artifactDir, { recursive: true });

  const storedFileName = `${name}.gz`;
  const storagePath = path.join(artifactDir, storedFileName);

  // Compress and write
  if (stat.isDirectory()) {
    // For directories, tar+gzip them
    const { execAsync } = await import("./exec");
    const tarPath = path.join(artifactDir, `${name}.tar.gz`);
    await execAsync(
      `tar -czf "${tarPath}" -C "${path.dirname(sourcePath)}" "${path.basename(sourcePath)}"`,
      {
        timeout: 120_000,
      },
    );
    const finalStat = await fs.stat(tarPath);
    // Record in DB
    const db = getDatabase();
    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.workflowArtifacts).values({
      id,
      runId,
      jobId: jobId ?? null,
      name,
      sizeBytes: finalStat.size,
      storagePath: tarPath,
      mimeType: "application/gzip",
      downloadCount: 0,
      expiresAt,
      createdAt: new Date(),
    });

    logger.info(
      { artifactId: id, name, runId, size: finalStat.size },
      "Artifact uploaded (directory)",
    );

    return {
      id,
      runId,
      jobId: jobId ?? null,
      name,
      sizeBytes: finalStat.size,
      mimeType: "application/gzip",
      downloadCount: 0,
      expiresAt,
      createdAt: new Date(),
    };
  } else {
    // Single file — gzip it
    await pipeline(
      createReadStream(sourcePath),
      createGzip(),
      createWriteStream(storagePath),
    );

    const compressedStat = await fs.stat(storagePath);

    // Record in DB
    const db = getDatabase();
    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.workflowArtifacts).values({
      id,
      runId,
      jobId: jobId ?? null,
      name,
      sizeBytes: stat.size, // original size
      storagePath,
      mimeType: mimeType ?? "application/octet-stream",
      downloadCount: 0,
      expiresAt,
      createdAt: new Date(),
    });

    logger.info(
      {
        artifactId: id,
        name,
        runId,
        size: stat.size,
        compressed: compressedStat.size,
      },
      "Artifact uploaded",
    );

    return {
      id,
      runId,
      jobId: jobId ?? null,
      name,
      sizeBytes: stat.size,
      mimeType: mimeType ?? "application/octet-stream",
      downloadCount: 0,
      expiresAt,
      createdAt: new Date(),
    };
  }
}

/**
 * Download an artifact by run ID and name.
 * Returns a readable stream of the decompressed content.
 */
export async function downloadArtifact(
  runId: string,
  name: string,
): Promise<{ stream: Readable; artifact: Artifact }> {
  const db = getDatabase();

  const record = await db.query.workflowArtifacts.findFirst({
    where: and(
      eq(schema.workflowArtifacts.runId, runId),
      eq(schema.workflowArtifacts.name, name),
    ),
  });

  if (!record) {
    throw new Error(`Artifact "${name}" not found for run ${runId}`);
  }

  // Check if expired
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    throw new Error(`Artifact "${name}" has expired`);
  }

  // Verify file exists
  try {
    await fs.access(record.storagePath);
  } catch {
    throw new Error(`Artifact file not found on disk: ${record.storagePath}`);
  }

  // Increment download count
  // @ts-expect-error - Drizzle multi-db union type issue
  await db
    .update(schema.workflowArtifacts)
    .set({ downloadCount: (record.downloadCount ?? 0) + 1 })
    .where(eq(schema.workflowArtifacts.id, record.id));

  // Return decompressed stream
  const isGzip =
    record.storagePath.endsWith(".gz") ||
    record.storagePath.endsWith(".tar.gz");
  const readStream = createReadStream(record.storagePath);
  const stream =
    isGzip && !record.storagePath.endsWith(".tar.gz")
      ? readStream.pipe(createGunzip())
      : readStream;

  return {
    stream: stream as Readable,
    artifact: {
      id: record.id,
      runId: record.runId,
      jobId: record.jobId,
      name: record.name,
      sizeBytes: record.sizeBytes,
      mimeType: record.mimeType,
      downloadCount: (record.downloadCount ?? 0) + 1,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    },
  };
}

/**
 * List all artifacts for a workflow run
 */
export async function listArtifacts(runId: string): Promise<Artifact[]> {
  const db = getDatabase();

  const records = await db.query.workflowArtifacts.findMany({
    where: eq(schema.workflowArtifacts.runId, runId),
    orderBy: (artifacts, { desc }) => [desc(artifacts.createdAt)],
  });

  return records.map((r) => ({
    id: r.id,
    runId: r.runId,
    jobId: r.jobId,
    name: r.name,
    sizeBytes: r.sizeBytes,
    mimeType: r.mimeType,
    downloadCount: r.downloadCount ?? 0,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
}

/**
 * Delete an artifact (by ID)
 */
export async function deleteArtifact(artifactId: string): Promise<void> {
  const db = getDatabase();

  const record = await db.query.workflowArtifacts.findFirst({
    where: eq(schema.workflowArtifacts.id, artifactId),
  });

  if (!record) return;

  // Remove file from disk
  try {
    await fs.rm(path.dirname(record.storagePath), {
      recursive: true,
      force: true,
    });
  } catch {
    logger.warn(
      { artifactId, path: record.storagePath },
      "Failed to delete artifact file",
    );
  }

  // Remove DB record
  // @ts-expect-error - Drizzle multi-db union type issue
  await db
    .delete(schema.workflowArtifacts)
    .where(eq(schema.workflowArtifacts.id, artifactId));

  logger.info({ artifactId, name: record.name }, "Artifact deleted");
}

/**
 * Clean up expired artifacts (run periodically)
 */
export async function cleanupExpiredArtifacts(): Promise<number> {
  const db = getDatabase();
  const { lt } = await import("drizzle-orm");

  const expired = await db.query.workflowArtifacts.findMany({
    where: lt(schema.workflowArtifacts.expiresAt, new Date()),
  });

  let cleaned = 0;
  for (const record of expired) {
    try {
      await deleteArtifact(record.id);
      cleaned++;
    } catch (error) {
      logger.error(
        { error, artifactId: record.id },
        "Failed to clean expired artifact",
      );
    }
  }

  if (cleaned > 0) {
    logger.info({ count: cleaned }, "Expired artifacts cleaned up");
  }

  return cleaned;
}
