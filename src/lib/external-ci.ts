/**
 * External CI Integration Library
 * Official integrations with external CI/CD systems
 */

import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";
import { externalCIConfigs, externalBuilds } from "@/db/schema/missing-schemas";

/**
 * External CI provider configurations
 */
/**
 * External CI provider configurations
 */
// externalCIConfigs imported from schema

/**
 * External build records
 */
// externalBuilds imported from schema

export type ExternalCIConfig = typeof externalCIConfigs.$inferSelect;
export type ExternalBuild = typeof externalBuilds.$inferSelect;

/**
 * Supported CI providers
 */
export const CI_PROVIDERS = {
    jenkins: {
        name: "Jenkins",
        icon: "jenkins",
        triggerEndpoint: "/job/{project}/build",
        statusEndpoint: "/job/{project}/{build}/api/json",
    },
    circleci: {
        name: "CircleCI",
        icon: "circleci",
        triggerEndpoint: "/api/v2/project/{project}/pipeline",
        statusEndpoint: "/api/v2/pipeline/{pipeline}",
    },
    travis: {
        name: "Travis CI",
        icon: "travis",
        triggerEndpoint: "/repo/{project}/requests",
        statusEndpoint: "/build/{build}",
    },
    gitlab_ci: {
        name: "GitLab CI",
        icon: "gitlab",
        triggerEndpoint: "/api/v4/projects/{project}/trigger/pipeline",
        statusEndpoint: "/api/v4/projects/{project}/pipelines/{pipeline}",
    },
    azure_devops: {
        name: "Azure DevOps",
        icon: "azure",
        triggerEndpoint: "/{org}/{project}/_apis/build/builds",
        statusEndpoint: "/{org}/{project}/_apis/build/builds/{build}",
    },
    github_actions: {
        name: "GitHub Actions",
        icon: "github",
        triggerEndpoint: "/repos/{owner}/{repo}/actions/workflows/{workflow}/dispatches",
        statusEndpoint: "/repos/{owner}/{repo}/actions/runs/{run}",
    },
} as const;

/**
 * Configure external CI for a repository
 */
export async function configureExternalCI(options: {
    repositoryId: string;
    provider: keyof typeof CI_PROVIDERS;
    name: string;
    baseUrl: string;
    apiToken?: string;
    projectId?: string;
}): Promise<ExternalCIConfig> {
    const db = getDatabase();

    const config = {
        id: crypto.randomUUID(),
        repositoryId: options.repositoryId,
        provider: options.provider,
        name: options.name,
        baseUrl: options.baseUrl,
        apiToken: options.apiToken || null,
        projectId: options.projectId || null,
        webhookSecret: crypto.randomUUID(),
        isEnabled: true,
        syncStatus: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.externalCIConfigs).values(config);

    logger.info({
        repoId: options.repositoryId,
        provider: options.provider
    }, "External CI configured");

    return config as ExternalCIConfig;
}

/**
 * Get external CI configs for repository
 */
export async function getExternalCIConfigs(repositoryId: string): Promise<ExternalCIConfig[]> {
    const db = getDatabase();

    try {
        return await db.query.externalCIConfigs?.findMany({
            where: eq(schema.externalCIConfigs.repositoryId, repositoryId),
        }) || [];
    } catch {
        return [];
    }
}

/**
 * Trigger an external CI build
 */
export async function triggerExternalBuild(options: {
    configId: string;
    pullRequestId?: string;
    branch?: string;
    commitSha?: string;
}): Promise<ExternalBuild | null> {
    const db = getDatabase();

    const config = await db.query.externalCIConfigs?.findFirst({
        where: eq(schema.externalCIConfigs.id, options.configId),
    });

    if (!config || !config.isEnabled) {
        return null;
    }

    const provider = CI_PROVIDERS[config.provider as keyof typeof CI_PROVIDERS];
    if (!provider) {
        logger.error({ provider: config.provider }, "Unknown CI provider");
        return null;
    }

    // Build the trigger URL
    let triggerUrl = `${config.baseUrl}${provider.triggerEndpoint}`;
    triggerUrl = triggerUrl.replace("{project}", config.projectId || "");

    try {
        // Make API call to trigger build
        const response = await fetch(triggerUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiToken && { "Authorization": `Bearer ${config.apiToken}` }),
            },
            body: JSON.stringify({
                ref: options.branch || "main",
                sha: options.commitSha,
            }),
        });

        if (!response.ok) {
            logger.error({
                provider: config.provider,
                status: response.status
            }, "Failed to trigger external build");
            return null;
        }

        const data = await response.json();
        const externalBuildId = data.id || data.build_id || data.number || crypto.randomUUID();

        const build = {
            id: crypto.randomUUID(),
            configId: options.configId,
            pullRequestId: options.pullRequestId || null,
            externalBuildId: String(externalBuildId),
            buildNumber: data.number || null,
            status: "pending",
            url: data.url || data.web_url || null,
            startedAt: new Date(),
            completedAt: null,
            createdAt: new Date(),
        };

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.externalBuilds).values(build);

        logger.info({
            configId: options.configId,
            buildId: externalBuildId
        }, "External build triggered");

        return build as ExternalBuild;
    } catch (error) {
        logger.error({ error, configId: options.configId }, "Error triggering external build");
        return null;
    }
}

/**
 * Sync build status from external CI
 */
export async function syncBuildStatus(buildId: string): Promise<ExternalBuild | null> {
    const db = getDatabase();

    const build = await db.query.externalBuilds?.findFirst({
        where: eq(schema.externalBuilds.id, buildId),
    });

    if (!build) return null;

    const config = await db.query.externalCIConfigs?.findFirst({
        where: eq(schema.externalCIConfigs.id, build.configId),
    });

    if (!config) return null;

    const provider = CI_PROVIDERS[config.provider as keyof typeof CI_PROVIDERS];
    if (!provider) return null;

    let statusUrl = `${config.baseUrl}${provider.statusEndpoint}`;
    statusUrl = statusUrl
        .replace("{project}", config.projectId || "")
        .replace("{build}", build.externalBuildId)
        .replace("{pipeline}", build.externalBuildId);

    try {
        const response = await fetch(statusUrl, {
            headers: {
                ...(config.apiToken && { "Authorization": `Bearer ${config.apiToken}` }),
            },
        });

        if (!response.ok) return null;

        const data = await response.json();

        // Normalize status across providers
        const status = normalizeStatus(config.provider, data.status || data.result || data.state);
        const completedAt = status !== "pending" && status !== "running" ? new Date() : null;

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.externalBuilds)
            .set({
                status,
                completedAt,
                url: data.url || data.web_url || build.url,
            })
            .where(eq(schema.externalBuilds.id, buildId));

        // If syncing to PR, update PR check
        if (build.pullRequestId && config.syncStatus) {
            await syncStatusToPR(build.pullRequestId, config.name, status);
        }

        return { ...build, status, completedAt };
    } catch (error) {
        logger.error({ error, buildId }, "Error syncing build status");
        return null;
    }
}

/**
 * Normalize status across different CI providers
 */
function normalizeStatus(provider: string, rawStatus: string): string {
    const statusMap: Record<string, Record<string, string>> = {
        jenkins: {
            "SUCCESS": "success",
            "FAILURE": "failure",
            "UNSTABLE": "failure",
            "ABORTED": "cancelled",
            "BUILDING": "running",
            "NOT_BUILT": "pending",
        },
        circleci: {
            "success": "success",
            "failed": "failure",
            "error": "failure",
            "canceled": "cancelled",
            "running": "running",
            "pending": "pending",
        },
        travis: {
            "passed": "success",
            "failed": "failure",
            "errored": "failure",
            "canceled": "cancelled",
            "started": "running",
            "created": "pending",
        },
        gitlab_ci: {
            "success": "success",
            "failed": "failure",
            "canceled": "cancelled",
            "running": "running",
            "pending": "pending",
            "created": "pending",
        },
        azure_devops: {
            "succeeded": "success",
            "failed": "failure",
            "canceled": "cancelled",
            "inProgress": "running",
            "notStarted": "pending",
        },
    };

    const providerMap = statusMap[provider] || {};
    return providerMap[rawStatus] || "pending";
}

/**
 * Sync external CI status to PR
 */
async function syncStatusToPR(prId: string, checkName: string, status: string): Promise<void> {
    const db = getDatabase();

    const conclusion = status === "success" ? "success"
        : status === "failure" ? "failure"
            : status === "cancelled" ? "cancelled"
                : null;

    // Upsert PR check
    const existing = await db.query.pullRequestChecks.findFirst({
        where: and(
            eq(schema.pullRequestChecks.pullRequestId, prId),
            eq(schema.pullRequestChecks.name, checkName)
        ),
    });


    if (existing) {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.pullRequestChecks)
            .set({
                status: status === "running" ? "in_progress" : "completed",
                conclusion,
                updatedAt: new Date(),
            })
            .where(eq(schema.pullRequestChecks.id, existing.id));
    } else {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.pullRequestChecks).values({
            id: crypto.randomUUID(),
            pullRequestId: prId,
            name: checkName,
            headSha: "",
            status: status === "running" ? "in_progress" : "completed",
            conclusion,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }
}

/**
 * Handle webhook from external CI
 */
export async function handleExternalCIWebhook(
    webhookSecret: string,
    payload: Record<string, unknown>
): Promise<boolean> {
    const db = getDatabase();

    // Find config by webhook secret
    const config = await db.query.externalCIConfigs?.findFirst({
        where: eq(schema.externalCIConfigs.webhookSecret, webhookSecret),
    });

    if (!config) {
        logger.warn({ webhookSecret: webhookSecret.slice(0, 8) }, "Unknown webhook secret");
        return false;
    }

    // Extract build info from payload (provider-specific)
    const buildId = payload.build_id || payload.id || (payload.build as any)?.id;
    const status = payload.status || payload.state || payload.result;

    if (buildId && status) {
        // Find and update build
        const build = await db.query.externalBuilds?.findFirst({
            where: and(
                eq(schema.externalBuilds.configId, config.id),
                eq(schema.externalBuilds.externalBuildId, String(buildId))
            ),
        }) as ExternalBuild | undefined;

        if (build) {
            const normalizedStatus = normalizeStatus(config.provider, String(status));

            // @ts-expect-error - Drizzle multi-db union type issue
            await db.update(schema.externalBuilds)
                .set({
                    status: normalizedStatus,
                    completedAt: ["success", "failure", "cancelled"].includes(normalizedStatus)
                        ? new Date()
                        : null,
                })
                .where(eq(schema.externalBuilds.id, build.id));

            // Sync to PR
            if (build.pullRequestId && config.syncStatus) {
                await syncStatusToPR(build.pullRequestId, config.name, normalizedStatus);
            }
        }
    }

    return true;
}
