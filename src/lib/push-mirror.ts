/**
 * Push Mirror Library
 *
 * Mirrors repository refs OUT to an external remote — complements the
 * pull-only mirror sync in ./mirror-sync.ts.
 *
 * Storage: config lives on the `repositories` table, mirroring the pull-side
 * pattern exactly (mirrorUrl / mirrorToken / lastMirrorSyncAt / mirrorSyncStatus):
 *   - pushMirrorEnabled   master switch
 *   - pushMirrorUrl       destination remote (never contains credentials)
 *   - pushMirrorToken     encrypted auth token (workflow-secret-crypto)
 *   - pushMirrorStatus    pending | pushing | success | failed
 *   - lastPushMirrorAt    timestamp of last completed push attempt
 *
 * Limitation: ONE push remote per repository.
 *
 * Security:
 *   - Tokens are encrypted at rest and decrypted only transiently into the
 *     remote URL per attempt (same mechanism as pull mirrors); they are never
 *     persisted in git config or returned by any API.
 *   - Destination URLs are SSRF-validated with validateGitCloneUrl. Private
 *     targets are rejected unless PUSH_MIRROR_ALLOW_PRIVATE=true (same opt-in
 *     pattern as FEDERATION_ALLOW_LOCALHOST).
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { repositories } from "@/db/schema/repositories";
import { logger } from "./logger";
import { resolveRepoPath } from "./git-storage";
import { validateGitCloneUrl } from "./url-validator";
import { encryptWorkflowSecret } from "./workflow-secret-crypto";
// Shared transient-token URL builder — identical semantics to pull-side fetch auth.
import { buildFetchUrl as buildAuthenticatedRemoteUrl } from "./mirror-sync";

export interface ConfigurePushMirrorInput {
    url: string;
    /** Plaintext token; encrypted before storage. null clears a stored token. Omit to keep existing. */
    authToken?: string | null;
}

export interface PushMirrorConfig {
    enabled: boolean;
    url: string | null;
    hasToken: boolean;
    status: string | null;
    lastPushMirrorAt: Date | null;
}

export interface PushMirrorResult {
    success: boolean;
    refsUpdated: number;
    error?: string;
    durationMs?: number;
}

export interface ProcessDuePushMirrorsOptions {
    limit?: number;
    minIntervalSeconds?: number;
}

export interface ProcessDuePushMirrorsResult {
    total: number;
    eligible: number;
    pushed: number;
    failed: number;
    failedRepoIds: string[];
    durationMs: number;
}

function getDb(): NodePgDatabase<typeof schema> {
    return getDatabase() as NodePgDatabase<typeof schema>;
}

/**
 * SSRF-validate a push destination URL. Rejects file://, non-git schemes,
 * localhost/private networks unless explicitly allowed via
 * PUSH_MIRROR_ALLOW_PRIVATE=true.
 */
export async function validatePushMirrorUrl(
    url: string
): Promise<{ valid: true } | { valid: false; reason: string }> {
    const allowPrivate = process.env.PUSH_MIRROR_ALLOW_PRIVATE === "true";
    return validateGitCloneUrl(url, allowPrivate);
}

/** Timeout in seconds for a single push attempt. */
function getPushTimeoutSecs(): number {
    const raw = parseInt(
        process.env.PUSH_MIRROR_TIMEOUT_SECS ||
            process.env.GIT_PROCESS_TIMEOUT_SECS ||
            "300",
        10
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

/** Min interval between automatic pushes of the same repo. */
function getMinIntervalSecs(override?: number): number {
    if (override !== undefined && Number.isFinite(override) && override >= 0) {
        return override;
    }
    const raw = parseInt(process.env.PUSH_MIRROR_MIN_INTERVAL_SECS || "300", 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : 300;
}

/**
 * Git error output can echo the authenticated remote URL (with embedded
 * token). Redact any userinfo password before storing/logging.
 */
export function redactCredentials(message: string): string {
    return message.replace(
        /(https?:\/\/[^:@/\s]+):([^@\s/]+)@/gi,
        "$1:***@"
    );
}

async function markStatus(repoId: string, values: Record<string, unknown>): Promise<void> {
    const db = getDb();
    await db
        .update(repositories)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(repositories.id, repoId));
}

/**
 * Enable/update the push mirror configuration for a repository.
 */
export async function configurePushMirror(
    repoId: string,
    input: ConfigurePushMirrorInput
): Promise<{ success: boolean; config?: PushMirrorConfig; error?: string }> {
    const validation = await validatePushMirrorUrl(input.url);
    if (!validation.valid) {
        return { success: false, error: validation.reason };
    }

    const db = getDb();
    const rows = await db
        .select({ id: repositories.id })
        .from(repositories)
        .where(eq(repositories.id, repoId))
        .limit(1);
    if (rows.length === 0) {
        return { success: false, error: "Repository not found" };
    }

    try {
        await markStatus(repoId, {
            pushMirrorEnabled: true,
            pushMirrorUrl: input.url,
            // Undefined = keep existing stored token; explicit value encrypts/replaces; null clears.
            ...(input.authToken === undefined
                ? {}
                : {
                      pushMirrorToken:
                          input.authToken === null || input.authToken === ""
                              ? null
                              : encryptWorkflowSecret(input.authToken),
                  }),
            pushMirrorStatus: "pending",
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error({ repoId, error: message }, "Failed to configure push mirror");
        return { success: false, error: message };
    }

    const config = await getPushMirror(repoId);
    return { success: true, config: config ?? undefined };
}

/**
 * Remove the push mirror configuration for a repository.
 */
export async function removePushMirror(
    repoId: string
): Promise<{ success: boolean; error?: string }> {
    const db = getDb();
    try {
        const rows = await db
            .select({ id: repositories.id })
            .from(repositories)
            .where(eq(repositories.id, repoId))
            .limit(1);
        if (rows.length === 0) {
            return { success: false, error: "Repository not found" };
        }

        await markStatus(repoId, {
            pushMirrorEnabled: false,
            pushMirrorUrl: null,
            pushMirrorToken: null,
            pushMirrorStatus: null,
        });
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error({ repoId, error: message }, "Failed to remove push mirror");
        return { success: false, error: message };
    }
}

/**
 * Read the push mirror configuration. Never exposes the token itself.
 */
export async function getPushMirror(repoId: string): Promise<PushMirrorConfig | null> {
    const db = getDb();
    const rows = await db
        .select({
            enabled: repositories.pushMirrorEnabled,
            url: repositories.pushMirrorUrl,
            token: repositories.pushMirrorToken,
            status: repositories.pushMirrorStatus,
            lastPushMirrorAt: repositories.lastPushMirrorAt,
        })
        .from(repositories)
        .where(eq(repositories.id, repoId))
        .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
        enabled: row.enabled,
        url: row.url,
        hasToken: row.token !== null && row.token !== undefined,
        status: row.status,
        lastPushMirrorAt: row.lastPushMirrorAt,
    };
}

/**
 * Push all branches and tags to the configured external remote right now.
 *
 * Uses an explicit forced refspec list (+refs/heads/* and +refs/tags/*) so we
 * never push hidden refs (refs/pull/*, notes, etc.) unintentionally — unlike
 * a blind `git push --mirror`. Credentials are injected into the URL per
 * attempt and never persisted. Never throws.
 */
export async function pushMirrorNow(repositoryId: string): Promise<PushMirrorResult> {
    const startedAt = Date.now();

    let repo: typeof repositories.$inferSelect | undefined;
    try {
        const db = getDb();
        const rows = await db
            .select()
            .from(repositories)
            .where(eq(repositories.id, repositoryId))
            .limit(1);
        repo = rows[0];
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error({ repoId: repositoryId, error: message }, "Failed to load repository for push mirror");
        return { success: false, refsUpdated: 0, error: message };
    }

    if (!repo) {
        return { success: false, refsUpdated: 0, error: "Repository not found" };
    }

    if (!repo.pushMirrorEnabled || !repo.pushMirrorUrl) {
        return { success: false, refsUpdated: 0, error: "Push mirror not configured" };
    }

    const timeoutSecs = getPushTimeoutSecs();

    try {
        const repoPath = await resolveRepoPath(repo.diskPath);

        // Mark as pushing
        try {
            await markStatus(repositoryId, { pushMirrorStatus: "pushing" });
        } catch (statusError) {
            logger.warn(
                { repoId: repositoryId, error: statusError instanceof Error ? statusError.message : "unknown" },
                "Failed to mark push mirror status as pushing"
            );
        }

        // Lazy-load simple-git (via the sanitized-env wrapper) so this module
        // stays cheap to import in workers/cron contexts.
        const { createSimpleGit } = await import("./git");
        const git = createSimpleGit({
            baseDir: repoPath,
            // simple-git kills the underlying git process when the block
            // timeout elapses — our process kill guarantee.
            timeout: { block: timeoutSecs * 1000 },
        });

        // Transient credential injection — decrypted per attempt, never persisted.
        const pushUrl = buildAuthenticatedRemoteUrl(repo.pushMirrorUrl, repo.pushMirrorToken);

        const pushArgs = [
            "push",
            "--prune",
            pushUrl,
            "+refs/heads/*:refs/heads/*",
            "+refs/tags/*:refs/tags/*",
        ];

        logger.info({ repoId: repositoryId }, "Starting push mirror");

        let timer: ReturnType<typeof setTimeout> | undefined;
        const output = await Promise.race([
            git.raw(pushArgs),
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`Push mirror timed out after ${timeoutSecs}s`)),
                    timeoutSecs * 1000
                );
            }),
        ]).finally(() => clearTimeout(timer));

        const refsUpdated = String(output)
            .split("\n")
            .filter((line) => line.includes("->"))
            .length;

        await markStatus(repositoryId, {
            pushMirrorStatus: "success",
            lastPushMirrorAt: new Date(),
        });

        const durationMs = Date.now() - startedAt;
        logger.info({ repoId: repositoryId, refsUpdated, durationMs }, "Push mirror completed");

        return { success: true, refsUpdated, durationMs };
    } catch (error) {
        const errorMessage = redactCredentials(
            error instanceof Error ? error.message : "Unknown error"
        );

        logger.error({ repoId: repositoryId, error: errorMessage }, "Push mirror failed");

        try {
            await markStatus(repositoryId, { pushMirrorStatus: "failed" });
        } catch (statusError) {
            logger.error(
                { repoId: repositoryId, error: statusError instanceof Error ? statusError.message : "unknown" },
                "Failed to record push mirror failure status"
            );
        }

        return { success: false, refsUpdated: 0, error: errorMessage, durationMs: Date.now() - startedAt };
    }
}

/**
 * Find and process repos whose push mirror is due.
 *
 * Due means: push mirroring enabled AND either never pushed or last push older
 * than the min interval (PUSH_MIRROR_MIN_INTERVAL_SECS, default 300). Oldest
 * first. Repos are processed sequentially with per-repo isolation — one
 * failure never aborts the batch and this function never throws.
 */
export async function processDuePushMirrors(
    options: ProcessDuePushMirrorsOptions = {}
): Promise<ProcessDuePushMirrorsResult> {
    const startedAt = Date.now();
    const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : 10;
    const minIntervalSecs = getMinIntervalSecs(options.minIntervalSeconds);
    const cutoff = new Date(Date.now() - minIntervalSecs * 1000);

    const empty: ProcessDuePushMirrorsResult = {
        total: 0,
        eligible: 0,
        pushed: 0,
        failed: 0,
        failedRepoIds: [],
        durationMs: 0,
    };

    let dueRepoIds: string[] = [];
    try {
        const db = getDb();
        const enabledAndNeverPushed = and(
            eq(repositories.pushMirrorEnabled, true),
            isNull(repositories.lastPushMirrorAt)
        );

        // Never-pushed repos first (oldest created), then stale ones oldest-push-first.
        const neverPushed = await db
            .select({ id: repositories.id })
            .from(repositories)
            .where(enabledAndNeverPushed)
            .orderBy(asc(repositories.createdAt))
            .limit(limit);

        dueRepoIds = neverPushed.map((row) => row.id);

        if (dueRepoIds.length < limit) {
            const stale = await db
                .select({ id: repositories.id })
                .from(repositories)
                .where(
                    and(
                        eq(repositories.pushMirrorEnabled, true),
                        lt(repositories.lastPushMirrorAt, cutoff)
                    )
                )
                .orderBy(asc(repositories.lastPushMirrorAt))
                .limit(limit - dueRepoIds.length);

            dueRepoIds = dueRepoIds.concat(stale.map((row) => row.id));
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error({ error: message }, "Failed to select due push mirrors");
        return { ...empty, durationMs: Date.now() - startedAt };
    }

    let pushed = 0;
    let failed = 0;
    const failedRepoIds: string[] = [];

    for (const repoId of dueRepoIds) {
        try {
            const result = await pushMirrorNow(repoId);
            if (result.success) {
                pushed++;
            } else {
                failed++;
                failedRepoIds.push(repoId);
            }
        } catch (error) {
            // Defensive: pushMirrorNow should not throw, but isolate anyway.
            failed++;
            failedRepoIds.push(repoId);
            logger.error(
                { repoId, error: error instanceof Error ? error.message : "Unknown error" },
                "Unexpected error processing push mirror"
            );
        }
    }

    const durationMs = Date.now() - startedAt;
    if (dueRepoIds.length > 0) {
        logger.info(
            { total: dueRepoIds.length, pushed, failed, durationMs },
            "Push mirror batch completed"
        );
    }

    return {
        total: dueRepoIds.length,
        eligible: dueRepoIds.length,
        pushed,
        failed,
        failedRepoIds,
        durationMs,
    };
}
