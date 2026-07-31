import type { APIRoute, APIContext } from "astro";
import { getDatabase, schema } from "@/db";
import { withErrorHandler, success, badRequest, unauthorized } from "@/lib/api";
import { eq, and, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

const reviewerSchema = z.object({
    username: z.string().optional(),
    teamName: z.string().optional(),
    requiredCount: z.number().int().positive().optional(),
}).refine((value) => Boolean(value.username) !== Boolean(value.teamName), {
    message: "Each reviewer rule requires exactly one of username or teamName",
});

const createStateSchema = z.object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    color: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    isFinal: z.boolean().optional(),
    allowMerge: z.boolean().optional(),
    requireCodeOwner: z.boolean().optional(),
    reviewers: z.array(reviewerSchema).optional(),
});

export const GET: APIRoute = withErrorHandler(async ({ locals }: APIContext) => {
    const { repo } = locals as any;
    const db = getDatabase();

    const states = await db.query.prStateDefinitions.findMany({
        where: eq(schema.prStateDefinitions.repositoryId, repo.id),
        orderBy: asc(schema.prStateDefinitions.order),
        with: {
            reviewers: true,
        },
    });

    return success(states);
});

export const POST: APIRoute = withErrorHandler(async ({ request, locals }: APIContext) => {
    const { repo, user } = locals as any;
    const db = getDatabase();

    // Check permissions (repo admin required)
    const permissions = await import("@/lib/permissions").then(m => m.getRepoPermission(user.id, repo));
    if (permissions !== "admin") {
        return unauthorized("You must be an admin to manage PR states");
    }

    const body = await request.json().catch(() => null);
    const parsed = createStateSchema.safeParse(body);
    if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message || "Invalid state payload");
    }
    const { name, displayName, color, description, icon, isFinal, allowMerge, requireCodeOwner, reviewers } = parsed.data;
    const normalizedName = name.trim().toLowerCase().replace(/\s+/g, "_");

    const duplicate = await db.query.prStateDefinitions.findFirst({
        where: and(
            eq(schema.prStateDefinitions.repositoryId, repo.id),
            eq(schema.prStateDefinitions.name, normalizedName)
        ),
        columns: { id: true },
    });
    if (duplicate) {
        return badRequest(`State '${normalizedName}' already exists`);
    }

    const id = nanoid();

    // Get current max order
    const existing = await db.query.prStateDefinitions.findFirst({
        where: eq(schema.prStateDefinitions.repositoryId, repo.id),
        orderBy: (states, { desc }) => [desc(states.order)],
    });
    const nextOrder = (existing?.order ?? 0) + 1;

    const [newState] = await (db as any).insert(schema.prStateDefinitions).values({
        id,
        repositoryId: repo.id,
        name: normalizedName,
        displayName,
        color: color || "#6B7280",
        description,
        icon,
        isFinal: isFinal || false,
        allowMerge: allowMerge || false,
        requireCodeOwner: requireCodeOwner || false,
        order: nextOrder,
    }).returning();

    if (reviewers && reviewers.length > 0) {
        const resolvedReviewers = [];
        for (const reviewer of reviewers) {
            let userId = null;
            let teamId = null;
            if (reviewer.username) {
                const foundUser = await db.query.users.findFirst({
                    where: eq(schema.users.username, reviewer.username),
                    columns: { id: true }
                });
                if (!foundUser) {
                    return badRequest(`User '${reviewer.username}' not found`);
                }
                userId = foundUser.id;
            }
            resolvedReviewers.push({
                id: nanoid(),
                stateDefinitionId: id,
                userId,
                teamId,
                requiredCount: reviewer.requiredCount || 1,
            });
        }
        await (db as any).insert(schema.prStateReviewers).values(resolvedReviewers);
    }

    const created = await db.query.prStateDefinitions.findFirst({
        where: eq(schema.prStateDefinitions.id, id),
        with: {
            reviewers: true,
        },
    });

    return success(created || newState);
});
