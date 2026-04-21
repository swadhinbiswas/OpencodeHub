import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// Short-lived cache so we don't query the DB on every call,
// but updates in the dashboard propagate quickly (TTL 30s).
let configCache: Record<string, string> | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 30000;

export async function fetchSystemConfig(): Promise<Record<string, string>> {
  const now = Date.now();
  if (configCache && now - lastCacheTime < CACHE_TTL) {
    return configCache;
  }

  try {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const configs = await db.query.systemConfig.findMany({
      where: eq(schema.systemConfig.key, "general_config"),
    });

    if (configs.length > 0 && configs[0].value) {
      try {
        configCache = JSON.parse(configs[0].value);
        lastCacheTime = now;
        return configCache as Record<string, string>;
      } catch {
        configCache = null;
        lastCacheTime = now;
      }
    }

    configCache = {};
    lastCacheTime = now;
    return configCache;
  } catch {
    configCache = null;
    return {};
  }
}

/**
 * Supercharges standard process.env to check the Database Admin Settings first.
 * If the environment setting (e.g. OPENAI_API_KEY) is declared in the Admin UI,
 * it safely overrides the .env file.
 */
export async function getEnv(
  key:
    | "OPENAI_API_KEY"
    | "ANTHROPIC_API_KEY"
    | "GROQ_API_KEY"
    | "SMTP_HOST"
    | "SMTP_PORT"
    | "SMTP_USER"
    | "SMTP_PASSWORD"
    | "SMTP_FROM"
    | string,
): Promise<string | undefined> {
  const dbConfig = await fetchSystemConfig();

  // Mapping standard env keys to the JSON shape we use in settings.astro
  const dbMappedKeys: Record<string, string> = {
    OPENAI_API_KEY: "openaiKey",
    ANTHROPIC_API_KEY: "anthropicKey",
    GROQ_API_KEY: "groqKey",
    SMTP_HOST: "smtpHost",
    SMTP_PORT: "smtpPort",
    SMTP_USER: "smtpUser",
    SMTP_PASSWORD: "smtpPass",
    SMTP_FROM: "smtpFrom",
  };

  const dashboardKey = dbMappedKeys[key];

  // 1. Fallback to App Settings Override
  if (dashboardKey && dbConfig[dashboardKey]) {
    return dbConfig[dashboardKey] as string;
  }

  // 2. Primary .env Standard
  return process.env[key];
}
