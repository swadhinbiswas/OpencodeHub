import { getDatabase, schema } from "@/db";
import { generateId } from "@/lib/utils";
import { BranchProtectionSchema } from "@/lib/validation";
import { applyRateLimit } from "@/middleware/rate-limit";
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  badRequest,
  created,
  forbidden,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

// GET /api/repos/[repoId]/branch-protection - List rules
export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  // Apply rate limiting
  const rateLimitResponse = await applyRateLimit(request, "api");
  if (rateLimitResponse) return rateLimitResponse;

  const { repoId } = params;
  if (!repoId) {
    return badRequest("Missing repoId");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const rules = await db.query.branchProtection.findMany({
    where: eq(schema.branchProtection.repositoryId, repoId),
  });

  return success(rules);
});

// POST /api/repos/[repoId]/branch-protection - Create rule
export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const { repoId } = params;
  if (!repoId) {
    return badRequest("Missing repoId");
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return badRequest("Invalid JSON");
  }

  // Validate input with Zod
  const validation = BranchProtectionSchema.safeParse(body);
  if (!validation.success) {
    return badRequest("Validation failed", validation.error.errors);
  }

  const data = validation.data;

  // Verify authentication
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Check repository exists and user has admin permissions
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
      "You do not have permission to configure branch protection rules",
    );
  }

  const id = generateId("rule");

  await db.insert(schema.branchProtection).values({
    id,
    repositoryId: repoId,
    pattern: data.pattern,
    requiresPr: data.requiresPr ?? false,
    requiredApprovals: data.requiredApprovals ?? 1,
    dismissStaleReviews: data.dismissStaleReviews ?? false,
    requireCodeOwnerReviews: data.requireCodeOwnerReviews ?? false,
    allowForcePushes: data.allowForcePushes ?? false,
    active: data.active ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
    // createdById: tokenPayload.userId
  });

  // Audit log
  const { logAudit, getRequestMeta } = await import("@/lib/audit");
  const { ip, userAgent } = getRequestMeta(request);
  await logAudit({
    userId: tokenPayload.userId,
    repositoryId: repoId,
    action: "branch_protection.create",
    actorIp: ip,
    actorUserAgent: userAgent,
    targetType: "branch_protection",
    targetId: id,
    targetName: data.pattern,
    data: {
      requiredApprovals: data.requiredApprovals,
      requiresPr: data.requiresPr,
    },
  });

  logger.info(
    { repoId, ruleId: id, pattern: data.pattern },
    "Branch protection rule created",
  );

  return created({ id });
});
