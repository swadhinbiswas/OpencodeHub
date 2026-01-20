/**
 * Branch Protection API
 * Manage branch protection rules
 */

import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { parseBody, unauthorized, badRequest, notFound, success, serverError } from "@/lib/api";
import { z } from "zod";
import crypto from "crypto";

const protectionRuleSchema = z.object({
    pattern: z.string().min(1),
    requiresPr: z.boolean().default(false),
    requiredApprovals: z.number().int().min(0).max(10).default(1),
    dismissStaleReviews: z.boolean().default(false),
    requireCodeOwnerReviews: z.boolean().default(false),
    allowForcePushes: z.boolean().default(false),
});

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

// GET /api/repos/:owner/:repo/protection - Get protection rules
export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const { owner, repo } = params;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find repository
    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, owner as string),
            eq(schema.repositories.name, repo as string)
        ),
    });

    if (!repository) {
        return notFound("Repository not found");
    }

    // Get protection rules
    const rules = await db.query.branchProtection.findMany({
        where: eq(schema.branchProtection.repositoryId, repository.id),
    });

    return success({ rules });
});

// POST /api/repos/:owner/:repo/protection - Create protection rule
export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const parsed = await parseBody(request, protectionRuleSchema);
    if ("error" in parsed) return parsed.error;

    const { owner, repo } = params;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find repository
    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, owner as string),
            eq(schema.repositories.name, repo as string)
        ),
    });

    if (!repository) {
        return notFound("Repository not found");
    }

    const now = new Date();
    const ruleId = `bp_${crypto.randomBytes(8).toString("hex")}`;

    // Create rule
    await db.insert(schema.branchProtection).values({
        id: ruleId,
        repositoryId: repository.id,
        ...parsed.data,
        createdById: tokenPayload.userId,
        createdAt: now,
        updatedAt: now,
    });

    logger.info({ userId: tokenPayload.userId, repoId: repository.id, ruleId }, "Branch protection rule created");

    return success({
        message: "Protection rule created",
        rule: { id: ruleId, ...parsed.data },
    });
});

// DELETE /api/repos/:owner/:repo/protection/:ruleId - Delete protection rule
export const DELETE: APIRoute = withErrorHandler(async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
        return unauthorized();
    }

    const { owner, repo, ruleId } = params;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find repository
    const repository = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, owner as string),
            eq(schema.repositories.name, repo as string)
        ),
    });

    if (!repository) {
        return notFound("Repository not found");
    }

    // Delete rule
    await db.delete(schema.branchProtection).where(eq(schema.branchProtection.id, ruleId as string));

    logger.info({ userId: tokenPayload.userId, repoId: repository.id, ruleId }, "Branch protection rule deleted");

    return success({ message: "Protection rule deleted" });
});
