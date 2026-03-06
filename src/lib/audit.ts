/**
 * Audit Log Library
 * Structured audit logging for security-sensitive operations
 */

import { getDatabase, schema } from "@/db";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { logger } from "./logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuditAction =
  // User lifecycle
  | "user.delete"
  | "user.promote_admin"
  | "user.demote_admin"
  | "user.activate"
  | "user.deactivate"
  // Authentication
  | "pat.create"
  | "pat.delete"
  | "ssh_key.create"
  | "ssh_key.delete"
  // Repository management
  | "repo.transfer"
  | "repo.delete"
  | "repo.visibility_change"
  // Branch protection
  | "branch_protection.create"
  | "branch_protection.update"
  | "branch_protection.delete"
  // Organization
  | "org.member_role_change"
  | "org.member_add"
  | "org.member_remove"
  | "org.role_create"
  | "org.role_update"
  | "org.role_delete"
  // Admin
  | "admin.config_update"
  | "admin.storage_update"
  | "admin.storage_reset"
  | "admin.sync_trigger"
  | "admin.plugin_register"
  | "admin.plugin_update";

export type AuditActorType = "user" | "system" | "oauth_app";
export type AuditTargetType =
  | "user"
  | "repository"
  | "organization"
  | "token"
  | "ssh_key"
  | "branch_protection"
  | "role"
  | "plugin"
  | "config";

export interface AuditLogOptions {
  /** User ID of who performed the action (null for system events) */
  userId?: string | null;
  /** Repository context (if applicable) */
  repositoryId?: string | null;
  /** Organization context (if applicable) */
  organizationId?: string | null;
  /** The action that was performed */
  action: AuditAction;
  /** Type of actor */
  actorType?: AuditActorType;
  /** Actor's user ID (defaults to userId) */
  actorId?: string | null;
  /** Client IP address */
  actorIp?: string | null;
  /** Client user agent */
  actorUserAgent?: string | null;
  /** Type of the target resource */
  targetType?: AuditTargetType;
  /** ID of the target resource */
  targetId?: string | null;
  /** Human-readable name of the target */
  targetName?: string | null;
  /** Additional data (before/after values, metadata) */
  data?: Record<string, unknown> | null;
}

export interface AuditLogQuery {
  action?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  repositoryId?: string;
  organizationId?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Record an audit log entry for a security-sensitive operation.
 * This never throws — audit failures are logged but don't break operations.
 */
export async function logAudit(options: AuditLogOptions): Promise<void> {
  try {
    const db = getDatabase();
    const id = crypto.randomUUID();

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.auditLogs).values({
      id,
      userId: options.userId ?? null,
      repositoryId: options.repositoryId ?? null,
      organizationId: options.organizationId ?? null,
      action: options.action,
      actorType: options.actorType ?? "user",
      actorId: options.actorId ?? options.userId ?? null,
      actorIp: options.actorIp ?? null,
      actorUserAgent: options.actorUserAgent ?? null,
      targetType: options.targetType ?? null,
      targetId: options.targetId ?? null,
      targetName: options.targetName ?? null,
      data: options.data ? JSON.stringify(options.data) : null,
      createdAt: new Date(),
    });

    logger.debug(
      { action: options.action, targetId: options.targetId },
      "Audit log recorded",
    );
  } catch (error) {
    // Never let audit logging failures break the main operation
    logger.error(
      { error, action: options.action },
      "Failed to record audit log",
    );
  }
}

/**
 * Query audit logs with filtering and pagination
 */
export async function queryAuditLogs(query: AuditLogQuery = {}) {
  const db = getDatabase();
  const conditions = [];

  if (query.action) {
    conditions.push(eq(schema.auditLogs.action, query.action));
  }
  if (query.actorId) {
    conditions.push(eq(schema.auditLogs.actorId, query.actorId));
  }
  if (query.targetType) {
    conditions.push(eq(schema.auditLogs.targetType, query.targetType));
  }
  if (query.targetId) {
    conditions.push(eq(schema.auditLogs.targetId, query.targetId));
  }
  if (query.repositoryId) {
    conditions.push(eq(schema.auditLogs.repositoryId, query.repositoryId));
  }
  if (query.organizationId) {
    conditions.push(eq(schema.auditLogs.organizationId, query.organizationId));
  }
  if (query.since) {
    conditions.push(gte(schema.auditLogs.createdAt, query.since));
  }
  if (query.until) {
    conditions.push(lte(schema.auditLogs.createdAt, query.until));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const logs = await db.query.auditLogs.findMany({
    where: whereClause,
    orderBy: [desc(schema.auditLogs.createdAt)],
    limit: query.limit ?? 50,
    offset: query.offset ?? 0,
    with: {
      user: { columns: { id: true, username: true, email: true } },
    },
  });

  return logs;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract client IP and user agent from an Astro API request
 */
export function getRequestMeta(request: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const userAgent = request.headers.get("user-agent") ?? null;
  return { ip, userAgent };
}
