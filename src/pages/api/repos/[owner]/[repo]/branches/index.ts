import { getDatabase, schema } from "@/db";
import { createBranch, getBranches } from "@/lib/git";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const GET: APIRoute = async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    // Validate inputs
    if (!ownerName || !repoName) {
        return new Response("Missing parameters", { status: 400 });
    }

    // Check repo existence and permissions
    const db = getDatabase();
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName),
    });

    if (!repoOwner) {
        return new Response("Repository not found", { status: 404 });
    }

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repoName)
        ),
    });

    if (!repo) {
        return new Response("Repository not found", { status: 404 });
    }

    if (!(await canReadRepo(user?.id, repo))) {
        return new Response("Unauthorized", { status: 401 });
    }

    // Get branches
    try {
        const branches = await getBranches(repo.diskPath);
        return new Response(JSON.stringify(branches), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(`Failed to list branches: ${error}`, { status: 500 });
    }
};

export const POST: APIRoute = async ({ params, request, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) {
        return new Response("Unauthorized", { status: 401 });
    }

    // Validate inputs
    if (!ownerName || !repoName) {
        return new Response("Missing parameters", { status: 400 });
    }

    // Check repo existence and permissions
    const db = getDatabase();
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName),
    });

    if (!repoOwner) {
        return new Response("Repository not found", { status: 404 });
    }

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repoName)
        ),
    });

    if (!repo) {
        return new Response("Repository not found", { status: 404 });
    }

    if (!(await canWriteRepo(user.id, repo))) {
        return new Response("Forbidden", { status: 403 });
    }

    // Parse body
    const body = await request.json();
    const { name, startPoint } = body;

    if (!name) {
        return new Response("Branch name is required", { status: 400 });
    }

    // Create branch
    try {
        await createBranch(repo.diskPath, name, startPoint || "HEAD");
        return new Response(JSON.stringify({ success: true }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(`Failed to create branch: ${error}`, { status: 500 });
    }
};
