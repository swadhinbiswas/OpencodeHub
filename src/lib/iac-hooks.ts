import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { logger } from "@/lib/logger";
import type { CloudConfig } from "@/lib/cloud-integrations";
import { terraformApply, terraformPlan } from "@/lib/cloud-integrations";

export interface IaCHookRunResult {
  provider: string;
  configId: string;
  action: "plan" | "apply";
  success: boolean;
  runId?: string;
  status?: string;
  message?: string;
}

export function detectIaCFiles(changedFiles: string[]): string[] {
  const patterns = [
    /\.tf$/i,
    /\.tfvars(\.json)?$/i,
    /terraform\//i,
    /terragrunt\.hcl$/i,
    /pulumi\.(ya?ml|json|ts|js|py|go)$/i,
    /cloudformation\/.*\.(ya?ml|json)$/i,
    /k8s\/.*\.(ya?ml|json)$/i,
    /helm\/.*\.(ya?ml|tpl)$/i,
  ];
  return changedFiles.filter((file) => patterns.some((pattern) => pattern.test(file)));
}

export async function triggerIaCHooks(options: {
  repositoryId: string;
  action: "plan" | "apply";
  runId?: string;
  message?: string;
  configId?: string;
}): Promise<IaCHookRunResult[]> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const configs =
    (await db.query.cloudConfigs?.findMany({
      where: and(
        eq(schema.cloudConfigs.repositoryId, options.repositoryId),
        eq(schema.cloudConfigs.provider, "terraform"),
        eq(schema.cloudConfigs.isEnabled, true)
      ),
    })) || [];

  const targets = options.configId
    ? configs.filter((config) => config.id === options.configId)
    : configs;

  const results: IaCHookRunResult[] = [];
  for (const config of targets) {
    if (options.action === "plan") {
      const plan = await terraformPlan({
        config: config as CloudConfig,
        message: options.message,
      });
      results.push({
        provider: config.provider,
        configId: config.id,
        action: "plan",
        success: !!plan,
        runId: plan?.runId,
        status: plan?.status,
        message: plan ? "Terraform plan triggered" : "Terraform plan failed",
      });
      continue;
    }

    if (!options.runId) {
      results.push({
        provider: config.provider,
        configId: config.id,
        action: "apply",
        success: false,
        message: "runId is required for apply",
      });
      continue;
    }

    const ok = await terraformApply({
      config: config as CloudConfig,
      runId: options.runId,
      comment: options.message,
    });
    results.push({
      provider: config.provider,
      configId: config.id,
      action: "apply",
      success: ok,
      runId: options.runId,
      message: ok ? "Terraform apply triggered" : "Terraform apply failed",
    });
  }

  logger.info(
    { repositoryId: options.repositoryId, action: options.action, targets: targets.length },
    "IaC hooks executed"
  );
  return results;
}
