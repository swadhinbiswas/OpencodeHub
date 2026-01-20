import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { simpleGit } from "simple-git";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ... existing imports ...

export const POST: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ message: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    const { owner, repo } = params;
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find the source repository
    const ownerUser = await db.query.users.findFirst({
        where: eq(schema.users.username, owner!),
    });

    if (!ownerUser) {
        return new Response(JSON.stringify({ message: "Repository not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
        });
    }

    const sourceRepo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, ownerUser.id),
            eq(schema.repositories.name, repo!)
        ),
        with: { owner: true },
    });

    if (!sourceRepo) {
        return new Response(JSON.stringify({ message: "Repository not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Check if forking is allowed
    if (!sourceRepo.allowForking) {
        return new Response(JSON.stringify({ message: "Forking is disabled for this repository" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Check if user already has a fork
    const existingFork = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, user.id),
            eq(schema.repositories.forkedFromId, sourceRepo.id)
        ),
    });

    if (existingFork) {
        return new Response(JSON.stringify({
            message: "You already have a fork of this repository",
            fork: { owner: user.username, name: existingFork.name }
        }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Check if user has a repo with same name
    const sameNameRepo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, user.id),
            eq(schema.repositories.name, sourceRepo.name)
        ),
    });

    const forkName = sameNameRepo ? `${sourceRepo.name}-fork` : sourceRepo.name;
    const forkId = crypto.randomUUID();

    // Determine the disk path for fork
    // Use the same base structure as source repo
    let sourcePath = sourceRepo.diskPath;
    let targetPath: string;

    // Check if source path is absolute
    if (sourcePath.startsWith('/')) {
        // Absolute path - derive base from source
        const parts = sourcePath.split('/');
        const reposIdx = parts.findIndex(p => p === 'repos');
        if (reposIdx !== -1) {
            const basePath = parts.slice(0, reposIdx + 1).join('/');
            targetPath = `${basePath}/${user.username}/${forkName}.git`;
        } else {
            // Use same parent directory
            targetPath = join(dirname(dirname(sourcePath)), user.username, `${forkName}.git`);
        }
    } else {
        // Relative path - use same structure
        const parts = sourcePath.split('/');
        if (parts[0] === 'repos') {
            targetPath = `repos/${user.username}/${forkName}.git`;
        } else {
            targetPath = `repos/${user.username}/${forkName}.git`;
        }
    }

    // Resolve to full paths for git operations
    const fullSourcePath = sourcePath.startsWith('/') ? sourcePath : join(process.cwd(), sourcePath);
    const fullTargetPath = targetPath.startsWith('/') ? targetPath : join(process.cwd(), targetPath);

    // Check source exists
    if (!existsSync(fullSourcePath)) {
        return new Response(JSON.stringify({
            message: `Source repository not found at ${fullSourcePath}`
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Create parent directory
    const parentDir = dirname(fullTargetPath);
    if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
    }

    // Clone the git repository
    const git = simpleGit();
    await git.clone(fullSourcePath, fullTargetPath, ["--bare"]);

    // After successful git clone, create database record
    await db.insert(schema.repositories).values({
        id: forkId,
        name: forkName,
        slug: forkName.toLowerCase(),
        description: sourceRepo.description,
        ownerId: user.id,
        ownerType: "user",
        visibility: sourceRepo.visibility === "private" ? "private" : "public",
        defaultBranch: sourceRepo.defaultBranch,
        diskPath: targetPath,
        isFork: true,
        forkedFromId: sourceRepo.id,
        language: sourceRepo.language,
        topics: sourceRepo.topics,
        hasIssues: true,
        hasWiki: false,
        hasActions: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    // Update fork count on source repo
    await db.update(schema.repositories)
        .set({ forkCount: (sourceRepo.forkCount || 0) + 1 })
        .where(eq(schema.repositories.id, sourceRepo.id));

    logger.info({ userId: user.id, sourceRepoId: sourceRepo.id, forkId }, "Repository forked");

    return new Response(JSON.stringify({
        message: "Repository forked successfully",
        fork: {
            id: forkId,
            owner: user.username,
            name: forkName,
            url: `/${user.username}/${forkName}`
        }
    }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
    });
});
