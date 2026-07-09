import { getDatabase, schema } from "@/db";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  badRequest,
  forbidden,
  noContent,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { BranchProtectionSchema } from "@/lib/validation";

// ... existing imports ...

export const DELETE: APIRoute = withErrorHandler(
  async ({ params, request }) => {
    const { repoId, id } = params;
    if (!repoId || !id) return badRequest("IDs required");

    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
      return unauthorized();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Check permissions
    const repository = await db.query.repositories.findFirst({
      where: eq(schema.repositories.id, repoId),
    });

    if (!repository) {
      return badRequest("Repository not found");
    }

    const { canAdminRepo } = await import("@/lib/permissions");
    if (
      !(await canAdminRepo(tokenPayload.userId, repository, {
        isAdmin: tokenPayload.isAdmin,
      }))
    ) {
      return forbidden(
        "You do not have permission to delete branch protection rules",
      );
    }

    await db
      .delete(schema.branchProtection)
      .where(
        and(
          eq(schema.branchProtection.id, id),
          eq(schema.branchProtection.repositoryId, repoId),
        ),
      );

    // Audit log
    const { logAudit: logAuditDel, getRequestMeta: getMetaDel } =
      await import("@/lib/audit");
    const { ip: delIp, userAgent: delUa } = getMetaDel(request);
    await logAuditDel({
      userId: tokenPayload.userId,
      repositoryId: repoId,
      action: "branch_protection.delete",
      actorIp: delIp,
      actorUserAgent: delUa,
      targetType: "branch_protection",
      targetId: id,
    });

    logger.info({ repoId, ruleId: id }, "Branch protection rule deleted");

    return noContent();
  },
);

export const PUT: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { repoId, id } = params;
  if (!repoId || !id) return badRequest("IDs required");

  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return badRequest("Invalid JSON");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Check permissions
  const repository = await db.query.repositories.findFirst({
    where: eq(schema.repositories.id, repoId),
  });

  if (!repository) {
    return badRequest("Repository not found");
  }

  const { canAdminRepo } = await import("@/lib/permissions");
  if (
    !(await canAdminRepo(tokenPayload.userId, repository, {
      isAdmin: tokenPayload.isAdmin,
    }))
  ) {
    return forbidden(
      "You do not have permission to update branch protection rules",
    );
  }

  // Validate body
  const validation = BranchProtectionSchema.partial().safeParse(body);
  // Extra validation for requiredChecks array if present
  const requiredChecks = Array.isArray(body.requiredChecks)
    ? body.requiredChecks
    : undefined;

  if (!validation.success) {
    return badRequest("Validation failed", validation.error.errors);
  }

  const data = validation.data;

  await db.transaction(async (tx) => {
    // 1. Update main rule
    await tx
      .update(schema.branchProtection)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.branchProtection.id, id),
          eq(schema.branchProtection.repositoryId, repoId),
        ),
      );

    // 2. Update required checks if provided
    if (requiredChecks !== undefined) {
      // Get current pattern to know what to use for checks
      const currentRule = await tx.query.branchProtection.findFirst({
        where: eq(schema.branchProtection.id, id),
        columns: { pattern: true },
      });

      if (!currentRule) throw new Error("Rule not found");

      // Delete existing checks for this branch pattern
      // Note: This is a simplification. Ideally we track IDs.
      // But for this UI, we replace the list.
      await tx
        .delete(schema.requiredStatusChecks)
        .where(
          and(
            eq(schema.requiredStatusChecks.repositoryId, repoId),
            eq(schema.requiredStatusChecks.branch, currentRule.pattern),
          ),
        );

      // Insert new checks
      if (requiredChecks.length > 0) {
        await tx.insert(schema.requiredStatusChecks).values(
          requiredChecks.map((checkStr: string) => {
            const parts = checkStr.split(":");
            const checkName = parts[0].trim();
            const pathFilter = parts.length > 1 ? parts.slice(1).join(":").trim() : null;
            return {
              id: crypto.randomUUID(),
              repositoryId: repoId,
              branch: currentRule.pattern,
              checkName: checkName,
              pathFilter: pathFilter,
              isRequired: true,
              strictMode: true,
              createdAt: new Date(),
            };
          }),
        );
      }
    }
  });

  // Audit log
  const { logAudit: logAuditUp, getRequestMeta: getMetaUp } =
    await import("@/lib/audit");
  const { ip: upIp, userAgent: upUa } = getMetaUp(request);
  await logAuditUp({
    userId: tokenPayload.userId,
    repositoryId: repoId,
    action: "branch_protection.update",
    actorIp: upIp,
    actorUserAgent: upUa,
    targetType: "branch_protection",
    targetId: id,
    data: { changes: data },
  });

  logger.info(
    { repoId, ruleId: id, hasChecks: requiredChecks !== undefined },
    "Branch protection rule updated",
  );

  return success({ success: true });
});
