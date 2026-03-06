import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import {
  awsDeployECS,
  azureDeployAppService,
  gcpDeployCloudRun,
  k8sApplyDeployment,
  type CloudConfig,
} from "@/lib/cloud-integrations";
import { logger } from "@/lib/logger";

export interface CloudHookResult {
  configId: string;
  provider: string;
  success: boolean;
  deploymentId?: string;
  message?: string;
}

export async function triggerCloudDeploy(options: {
  repositoryId: string;
  configId?: string;
  imageTag?: string;
  clusterName?: string;
  serviceName?: string;
  taskDefinition?: string;
  appName?: string;
  namespace?: string;
  deploymentName?: string;
}): Promise<CloudHookResult[]> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const configs =
    (await db.query.cloudConfigs?.findMany({
      where: and(
        eq(schema.cloudConfigs.repositoryId, options.repositoryId),
        eq(schema.cloudConfigs.isEnabled, true)
      ),
    })) || [];

  const targets = options.configId
    ? configs.filter((config) => config.id === options.configId)
    : configs.filter((config) => ["aws", "gcp", "azure", "kubernetes"].includes(config.provider));

  const image = options.imageTag || "latest";
  const results: CloudHookResult[] = [];

  for (const config of targets) {
    try {
      if (config.provider === "aws") {
        const deployment = await awsDeployECS({
          config: config as CloudConfig,
          clusterName: options.clusterName || "default",
          serviceName: options.serviceName || "app",
          taskDefinition: options.taskDefinition || "app",
          imageTag: image,
        });
        results.push({
          configId: config.id,
          provider: config.provider,
          success: !!deployment,
          deploymentId: deployment?.id,
          message: deployment ? "AWS deployment triggered" : "AWS deployment failed",
        });
        continue;
      }

      if (config.provider === "gcp") {
        const deployment = await gcpDeployCloudRun({
          config: config as CloudConfig,
          serviceName: options.serviceName || "app",
          region: config.region || "us-central1",
          image,
        });
        results.push({
          configId: config.id,
          provider: config.provider,
          success: !!deployment,
          deploymentId: deployment?.id,
          message: deployment ? "GCP deployment triggered" : "GCP deployment failed",
        });
        continue;
      }

      if (config.provider === "azure") {
        const deployment = await azureDeployAppService({
          config: config as CloudConfig,
          resourceGroup: options.namespace || "default",
          appName: options.appName || "app",
          image,
        });
        results.push({
          configId: config.id,
          provider: config.provider,
          success: !!deployment,
          deploymentId: deployment?.id,
          message: deployment ? "Azure deployment triggered" : "Azure deployment failed",
        });
        continue;
      }

      if (config.provider === "kubernetes") {
        const deployment = await k8sApplyDeployment({
          config: config as CloudConfig,
          namespace: options.namespace || "default",
          name: options.deploymentName || "app",
          image,
          replicas: 1,
        });
        results.push({
          configId: config.id,
          provider: config.provider,
          success: !!deployment,
          deploymentId: deployment?.id,
          message: deployment ? "Kubernetes deployment applied" : "Kubernetes deployment failed",
        });
      }
    } catch (error) {
      logger.error({ configId: config.id, provider: config.provider, error }, "Cloud deploy hook failed");
      results.push({
        configId: config.id,
        provider: config.provider,
        success: false,
        message: error instanceof Error ? error.message : "Unknown cloud deploy error",
      });
    }
  }

  return results;
}
