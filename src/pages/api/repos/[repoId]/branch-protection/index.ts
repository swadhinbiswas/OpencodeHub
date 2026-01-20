import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { BranchProtectionSchema } from "@/lib/validation";
import { applyRateLimit } from "@/middleware/rate-limit";
import { generateId } from "@/lib/utils";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { badRequest, created, success } from "@/lib/api";

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

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Check active user? For now assuming admin/owner permission checked by middleware or UI context (TODO)

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
        // createdById: user.id // TODO: Get user from context
    });

    logger.info({ repoId, ruleId: id, pattern: data.pattern }, "Branch protection rule created");

    return created({ id });
});
