/**
 * Docker/OCI blob upload session management.
 *
 * Tracks in-flight chunked uploads (POST /v2/.../blobs/uploads/ → PATCH → PUT).
 * Chunks land in a temp file under .tmp/docker-uploads/<uuid>; the session map
 * lives in-process (single-node self-hosted deployments are the primary target,
 * mirroring how src/lib/action-resolver.ts handles its local cache).
 *
 * Security properties enforced here:
 * - digest verification (sha256) before any blob is admitted to storage
 * - TTL expiry (1h) and bounded session count so abandoned uploads cannot leak disk
 */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";

const UPLOAD_TTL_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 500;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export function maxBlobBytes(): number {
  const mb = parseInt(process.env.DOCKER_MAX_BLOB_MB || "8192", 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 8192) * 1024 * 1024;
}

export interface BlobUploadSession {
  id: string;
  imageName: string;
  size: number;
  createdAt: number;
}

const sessions = new Map<string, BlobUploadSession>();
let cleanupTimer: NodeJS.Timeout | null = null;

function uploadDir(): string {
  return path.join(process.cwd(), ".tmp", "docker-uploads");
}

function uploadPath(id: string): string {
  return path.join(uploadDir(), id);
}

function ensureCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.createdAt > UPLOAD_TTL_MS) {
        sessions.delete(id);
        void rm(uploadPath(id), { force: true }).catch(() => {});
      }
    }
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

function evictOldestIfNeeded(): void {
  while (sessions.size >= MAX_SESSIONS) {
    let oldestId: string | null = null;
    let oldestAt = Infinity;
    for (const [id, session] of sessions) {
      if (session.createdAt < oldestAt) {
        oldestAt = session.createdAt;
        oldestId = id;
      }
    }
    if (!oldestId) break;
    sessions.delete(oldestId);
    void rm(uploadPath(oldestId), { force: true }).catch(() => {});
  }
}

export async function createUploadSession(
  imageName: string,
): Promise<BlobUploadSession> {
  ensureCleanup();
  evictOldestIfNeeded();
  await mkdir(uploadDir(), { recursive: true });
  const id = randomUUID();
  const session: BlobUploadSession = {
    id,
    imageName,
    size: 0,
    createdAt: Date.now(),
  };
  sessions.set(id, session);
  await appendFile(uploadPath(id), Buffer.alloc(0));
  return session;
}

export function getUploadSession(id: string): BlobUploadSession | null {
  return sessions.get(id) ?? null;
}

export async function appendToUpload(
  id: string,
  chunk: Buffer,
): Promise<
  { ok: true; session: BlobUploadSession } | { ok: false; reason: string }
> {
  const session = sessions.get(id);
  if (!session) return { ok: false, reason: "BLOB_UPLOAD_UNKNOWN" };
  const newSize = session.size + chunk.length;
  if (newSize > maxBlobBytes()) {
    await cancelUpload(id);
    return { ok: false, reason: "BLOB_UPLOAD_INVALID" };
  }
  await appendFile(uploadPath(id), chunk);
  session.size = newSize;
  return { ok: true, session };
}

/**
 * Verify the assembled temp file against the expected digest and move it into
 * the storage adapter at the canonical content-addressed key.
 */
export async function finalizeUpload(
  id: string,
  expectedDigest: string,
  storageKey: string,
): Promise<
  | { ok: true; digest: string; size: number }
  | { ok: false; reason: string; status: number }
> {
  const session = sessions.get(id);
  if (!session) {
    return { ok: false, reason: "BLOB_UPLOAD_UNKNOWN", status: 404 };
  }

  const filePath = uploadPath(id);
  let fileInfo;
  try {
    fileInfo = await stat(filePath);
  } catch {
    sessions.delete(id);
    return { ok: false, reason: "BLOB_UPLOAD_UNKNOWN", status: 404 };
  }

  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  const computed = `sha256:${hash.digest("hex")}`;

  if (computed !== expectedDigest) {
    logger.warn(
      { expected: expectedDigest, computed, image: session.imageName },
      "Docker blob digest mismatch",
    );
    await cancelUpload(id);
    return { ok: false, reason: "DIGEST_INVALID", status: 400 };
  }

  const { getStorage } = await import("@/lib/storage");
  const storage = await getStorage();
  await storage.put(storageKey, createReadStream(filePath), {
    contentType: "application/octet-stream",
  });

  sessions.delete(id);
  await rm(filePath, { force: true }).catch(() => {});

  return { ok: true, digest: computed, size: fileInfo.size };
}

export async function cancelUpload(id: string): Promise<void> {
  sessions.delete(id);
  await rm(uploadPath(id), { force: true }).catch(() => {});
}
