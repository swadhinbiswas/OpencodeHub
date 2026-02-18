import type { APIRoute, APIContext } from "astro";
import { getDatabase, schema } from "@/db";
import { withErrorHandler, success, badRequest, unauthorized, notFound } from "@/lib/api";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";

const reviewerSchema = z.object({
    userId: z.string().optional(),
    teamId: z.string().optional(),
    requiredCount: z.number().int().positive().optional(),
}).refine((value) => Boolean(value.userId) !== Boolean(value.teamId), {
    message: "Each reviewer rule requires exactly one of userId or teamId",
});

const updateStateSchema = z.object({
    name: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
    color: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    isFinal: z.boolean().optional(),
    allowMerge: z.boolean().optional(),
    requireCodeOwner: z.boolean().optional(),
    order: z.number().int().optional(),
    reviewers: z.array(reviewerSchema).optional(),
});

export const PUT: APIRoute = withErrorHandler(async ({ params, request, locals }: APIContext) => {
    const { repo, user } = locals as any;
    const { id } = params;
    const db = getDatabase();

    if (!id) return badRequest("State ID is required");

    // Check permissions
    const permissions = await import("@/lib/permissions").then(m => m.getRepoPermission(user.id, repo));
    if (permissions !== "admin") {
        return unauthorized("You must be an admin to manage PR states");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateStateSchema.safeParse(body);
    if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message || "Invalid state payload");
    }
    const { name, displayName, color, description, icon, isFinal, allowMerge, requireCodeOwner, order, reviewers } = parsed.data;

    const existing = await db.query.prStateDefinitions.findFirst({
        where: and(
            eq(schema.prStateDefinitions.id, id),
            eq(schema.prStateDefinitions.repositoryId, repo.id)
        ),
    });

    if (!existing) return notFound("State not found");

    const [updated] = await (db as any).update(schema.prStateDefinitions)
        .set({
            name: name ?? existing.name,
            displayName: displayName ?? existing.displayName,
            color: color ?? existing.color,
            description: description ?? existing.description,
            icon: icon ?? existing.icon,
            isFinal: isFinal ?? existing.isFinal,
            allowMerge: allowMerge ?? existing.allowMerge,
            requireCodeOwner: requireCodeOwner ?? existing.requireCodeOwner,
            order: order ?? existing.order,
            updatedAt: new Date(),
        })
        .where(eq(schema.prStateDefinitions.id, id))
        .returning();

    if (reviewers) {
        await (db as any).delete(schema.prStateReviewers)
            .where(eq(schema.prStateReviewers.stateDefinitionId, id));

        if (reviewers.length > 0) {
            await (db as any).insert(schema.prStateReviewers).values(
                reviewers.map((reviewer) => ({
                    id: nanoid(),
                    stateDefinitionId: id,
                    userId: reviewer.userId || null,
                    teamId: reviewer.teamId || null,
                    requiredCount: reviewer.requiredCount || 1,
                }))
            );
        }
    }

    const hydrated = await db.query.prStateDefinitions.findFirst({
        where: eq(schema.prStateDefinitions.id, id),
        with: {
            reviewers: true,
        },
    });

    return success(hydrated || updated);
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals }: APIContext) => {
    const { repo, user } = locals as any;
    const { id } = params;
    const db = getDatabase();

    if (!id) return badRequest("State ID is required");

    // Check permissions
    const permissions = await import("@/lib/permissions").then(m => m.getRepoPermission(user.id, repo));
    if (permissions !== "admin") {
        return unauthorized("You must be an admin to manage PR states");
    }

    const existing = await db.query.prStateDefinitions.findFirst({
        where: and(
            eq(schema.prStateDefinitions.id, id),
            eq(schema.prStateDefinitions.repositoryId, repo.id)
        ),
    });

    if (!existing) return notFound("State not found");

    // Check if in use
    const used = await db.query.pullRequests.findFirst({
        where: eq(schema.pullRequests.stateId, id),
    });

    if (used) {
        return badRequest("Cannot delete state that is currently assigned to pull requests");
    }

    await (db as any).delete(schema.prStateDefinitions)
        .where(eq(schema.prStateDefinitions.id, id));

    return success({ success: true });
});
