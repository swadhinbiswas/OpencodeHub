import { desc, eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";

export type RunnerTokenAuditAction = "issued" | "revoked" | "consumed";

const TARGET_TYPE = "runner_registration_token";

function extractClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

export async function logRunnerTokenAuditEvent(options: {
  request: Request;
  repositoryId: string;
  tokenId: string;
  action: RunnerTokenAuditAction;
  userId?: string | null;
  actorType?: string;
  actorId?: string | null;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    await db.insert(schema.auditLogs).values({
      id: generateId("audit"),
      userId: options.userId || null,
      repositoryId: options.repositoryId,
      action: `runner_token_${options.action}`,
      actorType: options.actorType || (options.userId ? "user" : "system"),
      actorId: options.actorId || options.userId || null,
      actorIp: extractClientIp(options.request),
      actorUserAgent: options.request.headers.get("user-agent"),
      targetType: TARGET_TYPE,
      targetId: options.tokenId,
      targetName: options.tokenId,
      data: options.data ? JSON.stringify(options.data) : null,
      createdAt: new Date(),
    });
  } catch (error) {
    logger.warn({ error, tokenId: options.tokenId, action: options.action }, "Failed to log runner token audit event");
  }
}

export async function getRunnerTokenAuditHistory(
  repositoryId: string,
  limit = 50
): Promise<Array<{
  id: string;
  action: string;
  tokenId: string | null;
  actorType: string | null;
  actorId: string | null;
  actorIp: string | null;
  actorUserAgent: string | null;
  data: Record<string, unknown> | null;
  createdAt: Date;
}>> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const rows = await db.query.auditLogs.findMany({
    where: and(
      eq(schema.auditLogs.repositoryId, repositoryId),
      eq(schema.auditLogs.targetType, TARGET_TYPE)
    ),
    orderBy: [desc(schema.auditLogs.createdAt)],
    limit,
  });

  return rows.map((row) => {
    let parsedData: Record<string, unknown> | null = null;
    if (row.data) {
      try {
        const parsed = JSON.parse(row.data);
        if (typeof parsed === "object" && parsed !== null) {
          parsedData = parsed as Record<string, unknown>;
        }
      } catch {
        parsedData = null;
      }
    }

    return {
      id: row.id,
      action: row.action,
      tokenId: row.targetId,
      actorType: row.actorType,
      actorId: row.actorId,
      actorIp: row.actorIp,
      actorUserAgent: row.actorUserAgent,
      data: parsedData,
      createdAt: row.createdAt,
    };
  });
}

