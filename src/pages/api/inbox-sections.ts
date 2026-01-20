import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, asc } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { success, created, unauthorized, badRequest, serverError } from "@/lib/api";

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const GET: APIRoute = withErrorHandler(async ({ locals }) => {
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const sections = await db.query.inboxSections.findMany({
        where: eq(schema.inboxSections.userId, user.id),
        orderBy: [asc(schema.inboxSections.position)],
    });

    return success({
        sections: sections.map((s) => ({
            ...s,
            filters: s.filters ? JSON.parse(s.filters) : null,
        })),
    });
});

export const POST: APIRoute = withErrorHandler(async ({ locals, request }) => {
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    const body = await request.json();
    const { name, icon, color, filters } = body;

    if (!name) {
        return badRequest("Name required");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get max position
    const existing = await db.query.inboxSections.findMany({
        where: eq(schema.inboxSections.userId, user.id),
    });
    const maxPosition = Math.max(...existing.map((s) => s.position), -1);

    const section = {
        id: generateId(),
        userId: user.id,
        name,
        icon: icon || null,
        color: color || null,
        filters: filters ? JSON.stringify(filters) : null,
        position: maxPosition + 1,
        isDefault: false,
        isCollapsed: false,
        showCount: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.insert(schema.inboxSections).values(section);

    return created({ section });
});

export const PATCH: APIRoute = withErrorHandler(async ({ locals, request }) => {
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    const body = await request.json();
    const { id, name, icon, color, filters, isCollapsed, showCount, position } = body;

    if (!id) {
        return badRequest("Section ID required");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const updates: Record<string, unknown> = {
        updatedAt: new Date(),
    };

    if (name !== undefined) updates.name = name;
    if (icon !== undefined) updates.icon = icon;
    if (color !== undefined) updates.color = color;
    if (filters !== undefined) updates.filters = JSON.stringify(filters);
    if (isCollapsed !== undefined) updates.isCollapsed = isCollapsed;
    if (showCount !== undefined) updates.showCount = showCount;
    if (position !== undefined) updates.position = position;

    await db
        .update(schema.inboxSections)
        .set(updates)
        .where(eq(schema.inboxSections.id, id));

    return success({ success: true });
});

export const DELETE: APIRoute = withErrorHandler(async ({ locals, request }) => {
    const user = locals.user;

    if (!user) {
        return unauthorized();
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
        return badRequest("Section ID required");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    await db
        .delete(schema.inboxSections)
        .where(eq(schema.inboxSections.id, id));

    return success({ success: true });
});
