
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { canAdminRepo, canReadRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";
import { z } from "zod";
import { badRequest, forbidden, notFound, success, unauthorized, withErrorHandler } from "@/lib/api";

const createStateSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
});

function normalizeStateName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, "_");
}

async function resolveRepository(db: ReturnType<typeof getDatabase>, owner: string, repo: string) {
    const ownerUser = await db.query.users.findFirst({
        where: eq(schema.users.username, owner),
    });
    if (!ownerUser) return null;
    return db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.name, repo),
            eq(schema.repositories.ownerId, ownerUser.id)
        ),
    });
}

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner, repo } = params;
    const currentUser = locals.user;
    const db = getDatabase();

    if (!currentUser) return unauthorized();
    if (!owner || !repo) return badRequest("Missing parameters");

    const repository = await resolveRepository(db, owner, repo);
    if (!repository) return notFound("Repository not found");
    if (!(await canReadRepo(currentUser.id, repository, { isAdmin: currentUser.isAdmin ?? undefined }))) {
        return notFound("Repository not found");
    }

    const states = await db.query.prStateDefinitions.findMany({
        where: eq(schema.prStateDefinitions.repositoryId, repository.id),
        orderBy: (states, { asc }) => [asc(states.order)]
    });

    return success(states);
});

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
    const { owner, repo } = params;
    const db = getDatabase();
    const currentUser = locals.user;

    if (!currentUser) return unauthorized();
    if (!owner || !repo) return badRequest("Missing parameters");
    const repository = await resolveRepository(db, owner, repo);
    if (!repository) return notFound("Repository not found");

    if (!await canAdminRepo(currentUser.id, repository)) {
        return forbidden();
    }

    const body = await request.json().catch(() => null);
    const parsed = createStateSchema.safeParse(body);
    if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message || "Invalid state payload");
    }

    const normalizedName = normalizeStateName(parsed.data.name);
    const existingByName = await db.query.prStateDefinitions.findFirst({
        where: and(
            eq(schema.prStateDefinitions.repositoryId, repository.id),
            eq(schema.prStateDefinitions.name, normalizedName)
        ),
    });
    if (existingByName) {
        return badRequest(`State '${normalizedName}' already exists`);
    }

    const id = generateId("prstate");
    const count = await db.$count(schema.prStateDefinitions, eq(schema.prStateDefinitions.repositoryId, repository.id));

    // @ts-expect-error - Drizzle union type mismatch
    const [newState] = await db.insert(schema.prStateDefinitions).values({
        id,
        repositoryId: repository.id,
        name: normalizedName,
        displayName: parsed.data.name.trim(),
        description: parsed.data.description,
        order: count,
        color: "#808080",
    }).returning();

    return success(newState);
});
