
import type { APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from '@/db';
import { success, unauthorized, serverError, parseBody } from '@/lib/api';
import crypto from 'node:crypto';
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

const registerSchema = z.object({
    token: z.string(),
    name: z.string(),
    os: z.string().optional(),
    arch: z.string().optional(),
    version: z.string().optional(),
});



export const POST: APIRoute = withErrorHandler(async ({ request }) => {
    const parsed = await parseBody(request, registerSchema);
    if ('error' in parsed) return parsed.error;

    const { token, name, os, arch, version } = parsed.data;

    // Token format: owner/repo:secret
    const parts = token.split(':');
    if (parts.length !== 2) {
        return unauthorized("Invalid token format");
    }
    const [repoSlug, secret] = parts;
    const [ownerName, repoName] = repoSlug.split('/');

    if (!ownerName || !repoName) {
        return unauthorized("Invalid token format");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Find Repo
    const user = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName)
    });
    if (!user) return unauthorized("Invalid owner");

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, user.id),
            eq(schema.repositories.name, repoName)
        )
    });
    if (!repo) return unauthorized("Invalid repository");

    // Verify Secret
    const savedSecret = await db.query.workflowSecrets.findFirst({
        where: and(
            eq(schema.workflowSecrets.repositoryId, repo.id),
            eq(schema.workflowSecrets.name, "ACTIONS_RUNNER_TOKEN")
        )
    });

    if (!savedSecret || savedSecret.encryptedValue !== secret) {
        return unauthorized("Invalid registration token");
    }

    // Register Runner
    const runnerId = crypto.randomUUID();
    const runnerToken = crypto.randomUUID(); // Private token for this runner

    await db.insert(schema.pipelineRunners).values({
        id: runnerId,
        repositoryId: repo.id,
        token: runnerToken,
        name,
        os,
        arch,
        version,
        status: 'online',
        lastSeenAt: new Date()
    });

    logger.info({ runnerId, repoId: repo.id, name }, "Runner registered");

    return success({
        id: runnerId,
        token: runnerToken, // Runner should save this
        name,
        secret: runnerToken // Legacy field
    });
});
