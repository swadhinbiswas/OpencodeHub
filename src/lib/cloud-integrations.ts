/**
 * Cloud & Infrastructure Integrations Library
 * AWS, Google Cloud, Azure, Kubernetes, Terraform
 */

import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";

// ============================================================================
// SCHEMA
// ============================================================================

export const cloudConfigs = pgTable("cloud_configs", {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
        .references(() => repositories.id, { onDelete: "cascade" }),
    organizationId: text("organization_id"),
    provider: text("provider").notNull(), // aws, gcp, azure, kubernetes, terraform
    name: text("name").notNull(),
    region: text("region"),
    credentials: jsonb("credentials").$type<Record<string, string>>(),
    settings: jsonb("settings").$type<Record<string, unknown>>(),
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const deployments = pgTable("cloud_deployments", {
    id: text("id").primaryKey(),
    configId: text("config_id")
        .notNull()
        .references(() => cloudConfigs.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id"),
    commitSha: text("commit_sha").notNull(),
    environment: text("environment").notNull(), // staging, production, preview
    status: text("status").notNull(), // pending, running, success, failed, cancelled
    url: text("url"),
    logs: text("logs"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CloudConfig = typeof cloudConfigs.$inferSelect;
export type Deployment = typeof deployments.$inferSelect;

// ============================================================================
// CLOUD PROVIDERS
// ============================================================================

export const CLOUD_PROVIDERS = {
    aws: {
        name: "Amazon Web Services",
        icon: "aws",
        services: ["ECS", "EKS", "Lambda", "EC2", "S3", "CloudFront"],
    },
    gcp: {
        name: "Google Cloud Platform",
        icon: "gcp",
        services: ["Cloud Run", "GKE", "Cloud Functions", "App Engine", "GCS"],
    },
    azure: {
        name: "Microsoft Azure",
        icon: "azure",
        services: ["AKS", "App Service", "Functions", "Container Instances"],
    },
    kubernetes: {
        name: "Kubernetes",
        icon: "kubernetes",
        services: ["Deployments", "Services", "ConfigMaps", "Secrets"],
    },
    terraform: {
        name: "Terraform",
        icon: "terraform",
        services: ["Plan", "Apply", "Destroy", "State"],
    },
} as const;

// ============================================================================
// AWS INTEGRATION
// ============================================================================

export interface AWSCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    roleArn?: string;
}

export async function awsDeployECS(options: {
    config: CloudConfig;
    clusterName: string;
    serviceName: string;
    taskDefinition: string;
    imageTag: string;
}): Promise<Deployment | null> {
    const db = getDatabase();
    const credentials = options.config.credentials as unknown as AWSCredentials;

    try {
        // Create deployment record
        const deployment = {
            id: crypto.randomUUID(),
            configId: options.config.id,
            pullRequestId: null,
            commitSha: options.imageTag,
            environment: "production",
            status: "running",
            url: null,
            logs: null,
            startedAt: new Date(),
            completedAt: null,
            createdAt: new Date(),
        };


        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.deployments).values(deployment);

        // AWS ECS update-service API call
        const response = await fetch(
            `https://ecs.${credentials.region}.amazonaws.com/`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-amz-json-1.1",
                    "X-Amz-Target": "AmazonEC2ContainerServiceV20141113.UpdateService",
                    ...signAWSRequest(credentials, "ecs"),
                },
                body: JSON.stringify({
                    cluster: options.clusterName,
                    service: options.serviceName,
                    taskDefinition: options.taskDefinition,
                    forceNewDeployment: true,
                }),
            }
        );

        if (response.ok) {
            // @ts-expect-error - Drizzle multi-db union type issue
            await db.update(schema.deployments)
                .set({ status: "success", completedAt: new Date() })
                .where(eq(schema.deployments.id, deployment.id));
        } else {
            // @ts-expect-error - Drizzle multi-db union type issue
            await db.update(schema.deployments)
                .set({ status: "failed", completedAt: new Date() })
                .where(eq(schema.deployments.id, deployment.id));
        }

        return deployment as Deployment;
    } catch (error) {
        logger.error({ error }, "AWS ECS deployment failed");
        return null;
    }
}

export async function awsDeployLambda(options: {
    config: CloudConfig;
    functionName: string;
    s3Bucket: string;
    s3Key: string;
}): Promise<boolean> {
    const credentials = options.config.credentials as unknown as AWSCredentials;

    try {
        const response = await fetch(
            `https://lambda.${credentials.region}.amazonaws.com/2015-03-31/functions/${options.functionName}/code`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...signAWSRequest(credentials, "lambda"),
                },
                body: JSON.stringify({
                    S3Bucket: options.s3Bucket,
                    S3Key: options.s3Key,
                }),
            }
        );

        return response.ok;
    } catch {
        return false;
    }
}

// ============================================================================
// GOOGLE CLOUD INTEGRATION
// ============================================================================

export interface GCPCredentials {
    projectId: string;
    clientEmail: string;
    privateKey: string;
}

export async function gcpDeployCloudRun(options: {
    config: CloudConfig;
    serviceName: string;
    region: string;
    image: string;
    envVars?: Record<string, string>;
}): Promise<Deployment | null> {
    const db = getDatabase();
    const credentials = options.config.credentials as unknown as GCPCredentials;

    try {
        const deployment = {
            id: crypto.randomUUID(),
            configId: options.config.id,
            pullRequestId: null,
            commitSha: options.image.split(":").pop() || "",
            environment: "production",
            status: "running",
            url: null,
            logs: null,
            startedAt: new Date(),
            completedAt: null,
            createdAt: new Date(),
        };


        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.deployments).values(deployment);

        const token = await getGCPAccessToken(credentials);

        const response = await fetch(
            `https://run.googleapis.com/v2/projects/${credentials.projectId}/locations/${options.region}/services/${options.serviceName}`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    template: {
                        containers: [{
                            image: options.image,
                            env: Object.entries(options.envVars || {}).map(([name, value]) => ({ name, value })),
                        }],
                    },
                }),
            }
        );

        const status = response.ok ? "success" : "failed";
        const data = await response.json();

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.deployments)
            .set({
                status,
                url: data.uri,
                completedAt: new Date(),
            })
            .where(eq(schema.deployments.id, deployment.id));

        return deployment as Deployment;
    } catch (error) {
        logger.error({ error }, "GCP Cloud Run deployment failed");
        return null;
    }
}

async function getGCPAccessToken(credentials: GCPCredentials): Promise<string> {
    // In production, use google-auth-library
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: credentials.clientEmail,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
    };

    // Sign JWT with private key (simplified)
    const jwt = Buffer.from(JSON.stringify(payload)).toString("base64");

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    const data = await response.json();
    return data.access_token;
}

// ============================================================================
// AZURE INTEGRATION
// ============================================================================

export interface AzureCredentials {
    subscriptionId: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
}

export async function azureDeployAppService(options: {
    config: CloudConfig;
    resourceGroup: string;
    appName: string;
    image: string;
}): Promise<Deployment | null> {
    const db = getDatabase();
    const credentials = options.config.credentials as unknown as AzureCredentials;

    try {
        const deployment = {
            id: crypto.randomUUID(),
            configId: options.config.id,
            pullRequestId: null,
            commitSha: options.image.split(":").pop() || "",
            environment: "production",
            status: "running",
            url: null,
            logs: null,
            startedAt: new Date(),
            completedAt: null,
            createdAt: new Date(),
        };


        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.deployments).values(deployment);

        const token = await getAzureAccessToken(credentials);

        const response = await fetch(
            `https://management.azure.com/subscriptions/${credentials.subscriptionId}/resourceGroups/${options.resourceGroup}/providers/Microsoft.Web/sites/${options.appName}/config/appsettings?api-version=2022-03-01`,
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    properties: {
                        DOCKER_CUSTOM_IMAGE_NAME: options.image,
                    },
                }),
            }
        );

        const status = response.ok ? "success" : "failed";

        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.deployments)
            .set({
                status,
                url: `https://${options.appName}.azurewebsites.net`,
                completedAt: new Date(),
            })
            .where(eq(schema.deployments.id, deployment.id));

        return deployment as Deployment;
    } catch (error) {
        logger.error({ error }, "Azure App Service deployment failed");
        return null;
    }
}

async function getAzureAccessToken(credentials: AzureCredentials): Promise<string> {
    const response = await fetch(
        `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`,
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: credentials.clientId,
                client_secret: credentials.clientSecret,
                scope: "https://management.azure.com/.default",
                grant_type: "client_credentials",
            }),
        }
    );

    const data = await response.json();
    return data.access_token;
}

// ============================================================================
// KUBERNETES INTEGRATION
// ============================================================================

export interface KubernetesConfig {
    apiServer: string;
    token: string;
    namespace?: string;
    caCert?: string;
}

export async function k8sApplyDeployment(options: {
    config: CloudConfig;
    namespace: string;
    name: string;
    image: string;
    replicas?: number;
}): Promise<Deployment | null> {
    const db = getDatabase();
    const k8sConfig = options.config.credentials as unknown as KubernetesConfig;

    try {
        const deployment = {
            id: crypto.randomUUID(),
            configId: options.config.id,
            pullRequestId: null,
            commitSha: options.image.split(":").pop() || "",
            environment: options.namespace,
            status: "running",
            url: null,
            logs: null,
            startedAt: new Date(),
            completedAt: null,
            createdAt: new Date(),
        };


        // @ts-expect-error - Drizzle multi-db union type issue
        await db.insert(schema.deployments).values(deployment);

        const deploymentSpec = {
            apiVersion: "apps/v1",
            kind: "Deployment",
            metadata: {
                name: options.name,
                namespace: options.namespace,
            },
            spec: {
                replicas: options.replicas || 1,
                selector: { matchLabels: { app: options.name } },
                template: {
                    metadata: { labels: { app: options.name } },
                    spec: {
                        containers: [{
                            name: options.name,
                            image: options.image,
                            ports: [{ containerPort: 8080 }],
                        }],
                    },
                },
            },
        };

        const response = await fetch(
            `${k8sConfig.apiServer}/apis/apps/v1/namespaces/${options.namespace}/deployments/${options.name}`,
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${k8sConfig.token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(deploymentSpec),
            }
        );

        const status = response.ok ? "success" : "failed";


        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.deployments)
            .set({ status, completedAt: new Date() })
            .where(eq(schema.deployments.id, deployment.id));

        return deployment as Deployment;
    } catch (error) {
        logger.error({ error }, "Kubernetes deployment failed");
        return null;
    }
}

export async function k8sGetPods(config: CloudConfig, namespace: string, labelSelector?: string): Promise<{
    name: string;
    status: string;
    ready: boolean;
}[]> {
    const k8sConfig = config.credentials as unknown as KubernetesConfig;

    try {
        const url = new URL(`${k8sConfig.apiServer}/api/v1/namespaces/${namespace}/pods`);
        if (labelSelector) url.searchParams.set("labelSelector", labelSelector);

        const response = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${k8sConfig.token}` },
        });

        if (!response.ok) return [];

        const data = await response.json();
        return (data.items || []).map((pod: any) => ({
            name: pod.metadata.name,
            status: pod.status.phase,
            ready: pod.status.conditions?.some((c: any) => c.type === "Ready" && c.status === "True") || false,
        }));
    } catch {
        return [];
    }
}

export async function k8sRollback(config: CloudConfig, namespace: string, deploymentName: string): Promise<boolean> {
    const k8sConfig = config.credentials as unknown as KubernetesConfig;

    try {
        const response = await fetch(
            `${k8sConfig.apiServer}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}/rollback`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${k8sConfig.token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: deploymentName,
                    rollbackTo: { revision: 0 }, // Previous revision
                }),
            }
        );

        return response.ok;
    } catch {
        return false;
    }
}

// ============================================================================
// TERRAFORM INTEGRATION
// ============================================================================

export interface TerraformCloudConfig {
    organization: string;
    workspace: string;
    token: string;
}

export async function terraformPlan(options: {
    config: CloudConfig;
    message?: string;
}): Promise<{ runId: string; status: string } | null> {
    const tfConfig = options.config.credentials as unknown as TerraformCloudConfig;

    try {
        const response = await fetch(
            `https://app.terraform.io/api/v2/runs`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${tfConfig.token}`,
                    "Content-Type": "application/vnd.api+json",
                },
                body: JSON.stringify({
                    data: {
                        type: "runs",
                        attributes: {
                            message: options.message || "Plan triggered by OpenCodeHub",
                            "plan-only": true,
                        },
                        relationships: {
                            workspace: {
                                data: {
                                    type: "workspaces",
                                    id: tfConfig.workspace,
                                },
                            },
                        },
                    },
                }),
            }
        );

        if (!response.ok) return null;

        const data = await response.json();
        return {
            runId: data.data.id,
            status: data.data.attributes.status,
        };
    } catch (error) {
        logger.error({ error }, "Terraform plan failed");
        return null;
    }
}

export async function terraformApply(options: {
    config: CloudConfig;
    runId: string;
    comment?: string;
}): Promise<boolean> {
    const tfConfig = options.config.credentials as unknown as TerraformCloudConfig;

    try {
        const response = await fetch(
            `https://app.terraform.io/api/v2/runs/${options.runId}/actions/apply`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${tfConfig.token}`,
                    "Content-Type": "application/vnd.api+json",
                },
                body: JSON.stringify({
                    comment: options.comment || "Applied by OpenCodeHub",
                }),
            }
        );

        return response.ok;
    } catch {
        return false;
    }
}

export async function terraformGetState(config: CloudConfig): Promise<Record<string, unknown> | null> {
    const tfConfig = config.credentials as unknown as TerraformCloudConfig;

    try {
        const response = await fetch(
            `https://app.terraform.io/api/v2/workspaces/${tfConfig.workspace}/current-state-version`,
            {
                headers: { Authorization: `Bearer ${tfConfig.token}` },
            }
        );

        if (!response.ok) return null;

        const data = await response.json();
        return data.data.attributes;
    } catch {
        return null;
    }
}

// ============================================================================
// CONFIGURATION & HELPERS
// ============================================================================

export async function configureCloudProvider(options: {
    repositoryId?: string;
    organizationId?: string;
    provider: keyof typeof CLOUD_PROVIDERS;
    name: string;
    region?: string;
    credentials: Record<string, string>;
    settings?: Record<string, unknown>;
}): Promise<CloudConfig> {
    const db = getDatabase();

    const config = {
        id: crypto.randomUUID(),
        repositoryId: options.repositoryId || null,
        organizationId: options.organizationId || null,
        provider: options.provider,
        name: options.name,
        region: options.region || null,
        credentials: options.credentials,
        settings: options.settings || null,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // @ts-expect-error - Drizzle multi-db union type issue
    await db.insert(schema.cloudConfigs).values(config);

    logger.info({ provider: options.provider }, "Cloud provider configured");

    return config as CloudConfig;
}

export async function getCloudConfigs(options: {
    repositoryId?: string;
    organizationId?: string;
    provider?: string;
}): Promise<CloudConfig[]> {
    const db = getDatabase();

    try {
        let query = db.query.cloudConfigs?.findMany({}) || [];

        // Filter in memory
        const configs = await query;
        return configs.filter(c => {
            if (options.repositoryId && c.repositoryId !== options.repositoryId) return false;
            if (options.organizationId && c.organizationId !== options.organizationId) return false;
            if (options.provider && c.provider !== options.provider) return false;
            return true;
        });
    } catch {
        return [];
    }
}

export async function getDeploymentHistory(configId: string, limit = 20): Promise<Deployment[]> {
    const db = getDatabase();

    try {
        return await db.query.deployments?.findMany({
            where: eq(schema.deployments.configId, configId),
            orderBy: (d, { desc }) => [desc(d.createdAt)],
            limit,
        }) || [];
    } catch {
        return [];
    }
}

// AWS signature helper (simplified)
function signAWSRequest(credentials: AWSCredentials, service: string): Record<string, string> {
    // In production, use aws4 or @aws-sdk/signature-v4
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    return {
        "X-Amz-Date": date,
        "X-Amz-Security-Token": "",
        Authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${date.slice(0, 8)}/${credentials.region}/${service}/aws4_request`,
    };
}
