
import type { APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from 'zod';
import { eq, and, like, or } from 'drizzle-orm';
import { getDatabase, schema } from '@/db';
import { success, unauthorized, parseBody } from '@/lib/api';
import crypto from 'node:crypto';
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { hashRunnerSecret, verifyRunnerSecret } from "@/lib/runner-secrets";
import {
    decryptWorkflowSecret,
} from "@/lib/workflow-secret-crypto";
import {
    LEGACY_RUNNER_REGISTRATION_TOKEN_NAME,
    RUNNER_REGISTRATION_TOKEN_PREFIX,
    getRunnerRegistrationTokenTtlMs,
} from "@/lib/runner-registration-token";
import { logRunnerTokenAuditEvent } from "@/lib/runner-token-audit";

export const registerSchema = z.object({
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

    // Verify one-time registration secret and consume it.
    const candidateSecrets = await db.query.workflowSecrets.findMany({
        where: and(
            eq(schema.workflowSecrets.repositoryId, repo.id),
            or(
                eq(schema.workflowSecrets.name, LEGACY_RUNNER_REGISTRATION_TOKEN_NAME),
                like(schema.workflowSecrets.name, `${RUNNER_REGISTRATION_TOKEN_PREFIX}%`)
            )
        ),
        orderBy: (secrets, { desc }) => [desc(secrets.createdAt)],
        limit: 20,
    });

    const ttlMs = getRunnerRegistrationTokenTtlMs();
    let matchedSecret: typeof candidateSecrets[number] | null = null;

    for (const candidate of candidateSecrets) {
        const secretUpdatedAt = candidate.updatedAt || candidate.createdAt;
        if (secretUpdatedAt) {
            const ageMs = Date.now() - new Date(secretUpdatedAt).getTime();
            if (ageMs > ttlMs) {
                continue;
            }
        }

        try {
            const registrationSecret = decryptWorkflowSecret(candidate.encryptedValue);
            if (verifyRunnerSecret(registrationSecret, secret)) {
                matchedSecret = candidate;
                break;
            }
        } catch {
            // ignore invalid/decryption-failed rows
        }
    }

    if (!matchedSecret) {
        return unauthorized("Invalid registration token");
    }

    // Consume token so it cannot be reused.
    const consumed = await db
        .delete(schema.workflowSecrets)
        .where(eq(schema.workflowSecrets.id, matchedSecret.id))
        .returning({ id: schema.workflowSecrets.id });
    if (consumed.length === 0) {
        return unauthorized("Registration token already used");
    }

    // Register Runner
    const runnerId = crypto.randomUUID();
    const runnerToken = crypto.randomUUID(); // Private token for this runner

    await db.insert(schema.pipelineRunners).values({
        id: runnerId,
        repositoryId: repo.id,
        token: hashRunnerSecret(runnerToken),
        name,
        os,
        arch,
        version,
        status: 'online',
        lastSeenAt: new Date()
    });

    const matchedTokenId = matchedSecret.name.startsWith(RUNNER_REGISTRATION_TOKEN_PREFIX)
        ? matchedSecret.name.slice(RUNNER_REGISTRATION_TOKEN_PREFIX.length)
        : matchedSecret.name;
    await logRunnerTokenAuditEvent({
        request,
        repositoryId: repo.id,
        tokenId: matchedTokenId,
        action: "consumed",
        actorType: "runner",
        actorId: runnerId,
        data: {
            runnerId,
            runnerName: name,
            os,
            arch,
            version,
        },
    });

    logger.info({ runnerId, repoId: repo.id, name }, "Runner registered");

    return success({
        id: runnerId,
        token: runnerToken, // Runner should save this
        name,
        secret: runnerToken // Legacy field
    });
});
