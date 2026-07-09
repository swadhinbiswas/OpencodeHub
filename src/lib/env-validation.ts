/**
 * Environment Variable Validation
 * Run this at application startup to ensure all required configuration is present
 */

import { logger } from "@/lib/logger";

interface EnvConfig {
    name: string;
    required: boolean;
    defaultValue?: string;
    validator?: (value: string) => boolean;
    errorMessage?: string;
}

const envVars: EnvConfig[] = [
    // Security (Critical)
    {
        name: "JWT_SECRET",
        required: true,
        validator: (v) => v.length >= 32,
        errorMessage: "JWT_SECRET must be at least 32 characters for production security",
    },
    {
        name: "SESSION_SECRET",
        required: true,
        validator: (v) => v.length >= 32,
        errorMessage: "SESSION_SECRET must be at least 32 characters",
    },
    {
        name: "INTERNAL_HOOK_SECRET",
        required: true,
        validator: (v) => v.length >= 16,
        errorMessage: "INTERNAL_HOOK_SECRET must be set for git hook security",
    },
    {
        name: "CRON_SECRET",
        required: true,
        validator: (v) => v.length >= 16,
        errorMessage: "CRON_SECRET must be set for cron endpoint security",
    },
    {
        name: "RUNNER_SECRET",
        required: true,
        validator: (v) => v.length >= 32,
        errorMessage: "RUNNER_SECRET must be at least 32 characters",
    },
    {
        name: "RUNNER_REGISTRATION_TOKEN_TTL_DAYS",
        required: false,
        validator: (v) => Number.isFinite(Number(v)) && Number(v) > 0,
        errorMessage: "RUNNER_REGISTRATION_TOKEN_TTL_DAYS must be a positive number",
    },
    {
        name: "AI_CONFIG_ENCRYPTION_KEY",
        required: false,
        validator: (v) => v.length >= 32,
        errorMessage: "AI_CONFIG_ENCRYPTION_KEY should be at least 32 characters",
    },
    {
        name: "WORKFLOW_SECRET_ENCRYPTION_KEY",
        required: false,
        validator: (v) => v.length >= 32,
        errorMessage: "WORKFLOW_SECRET_ENCRYPTION_KEY should be at least 32 characters",
    },
    {
        name: "REDIS_URL",
        required: false,
        validator: (v) => v.startsWith("redis://") || v.startsWith("rediss://"),
        errorMessage: "REDIS_URL must be a valid redis:// or rediss:// URL",
    },

    // Application URLs (Critical)
    {
        name: "SITE_URL",
        required: true,
        validator: (v) => v.startsWith("http://") || v.startsWith("https://"),
        errorMessage: "SITE_URL must be a valid URL (http:// or https://)",
    },

    // Database
    {
        name: "DATABASE_DRIVER",
        required: false,
        defaultValue: "sqlite",
    },
    {
        name: "DATABASE_URL",
        required: false,
        defaultValue: "./data/opencodehub.db",
    },

    // Storage
    {
        name: "STORAGE_TYPE",
        required: false,
        defaultValue: "local",
        validator: (v) => ["local", "s3"].includes(v.toLowerCase()),
        errorMessage:
            "STORAGE_TYPE must be one of: local, s3. (Other backends like Google Drive, OneDrive, Dropbox, FTP, Azure, GCS, rclone-as-adapter have been removed; use the s3 driver with a compatible endpoint for object storage, or local for a filesystem path.)",
    },
    {
        name: "STORAGE_PATH",
        required: false,
        defaultValue: "./data/storage",
    },
    // S3 Storage (Required if STORAGE_TYPE=s3)
    {
        name: "STORAGE_BUCKET",
        required: false,
    },
    {
        name: "STORAGE_ENDPOINT",
        required: false,
    },
    {
        name: "STORAGE_ACCESS_KEY_ID",
        required: false,
    },
    {
        name: "STORAGE_SECRET_ACCESS_KEY",
        required: false,
    },
    {
        name: "STORAGE_REGION",
        required: false,
        defaultValue: "us-east-1",
    },


    // Git
    {
        name: "GIT_REPOS_PATH",
        required: false,
        defaultValue: "./data/repositories",
    },
    {
        name: "GIT_SSH_PORT",
        required: false,
        defaultValue: "2222",
    },

    // Features
    {
        name: "ENABLE_REGISTRATION",
        required: false,
        defaultValue: "true",
    },
    {
        name: "AIR_GAPPED_MODE",
        required: false,
        defaultValue: "false",
        validator: (v) => ["0", "1", "true", "false", "yes", "no"].includes(v.toLowerCase()),
        errorMessage: "AIR_GAPPED_MODE must be one of: true/false/1/0/yes/no",
    },

    // Grafana Cloud Loki
    {
        name: "LOKI_HOST",
        required: false,
    },
    {
        name: "LOKI_USER",
        required: false,
    },
    {
        name: "LOKI_PASSWORD",
        required: false,
    },
];

export function validateEnvironment(exitOnError: boolean = true): boolean {
    logger.info("🔍 Validating environment configuration...");

    // Auto-configure all paths if DATA_DIR is provided (All-in-one VPS/NAS mode)
    if (process.env.DATA_DIR) {
        const dataDir = process.env.DATA_DIR.replace(/\/$/, "");
        if (!process.env.DATABASE_URL) process.env.DATABASE_URL = `${dataDir}/opencodehub.db`;
        if (!process.env.STORAGE_PATH) process.env.STORAGE_PATH = `${dataDir}/storage`;
        if (!process.env.GIT_REPOS_PATH) process.env.GIT_REPOS_PATH = `${dataDir}/repositories`;
        if (!process.env.SSH_HOST_KEY_PATH) process.env.SSH_HOST_KEY_PATH = `${dataDir}/ssh/host_key`;
        logger.info(`📦 DATA_DIR mode enabled. All local data mapped to ${dataDir}`);
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    for (const config of envVars) {
        const value = process.env[config.name];

        // Check required variables
        if (config.required && !value) {
            errors.push(`❌ Missing required environment variable: ${config.name}`);
            if (config.errorMessage) {
                errors.push(`   ${config.errorMessage}`);
            }
            continue;
        }

        // Apply defaults
        if (!value && config.defaultValue) {
            process.env[config.name] = config.defaultValue;
            warnings.push(`⚠️  Using default for ${config.name}: ${config.defaultValue}`);
            continue;
        }

        // Run custom validators
        if (value && config.validator) {
            if (!config.validator(value)) {
                errors.push(`❌ Invalid value for ${config.name}`);
                if (config.errorMessage) {
                    errors.push(`   ${config.errorMessage}`);
                }
            }
        }
    }

    // Security checks for production
    if (process.env.NODE_ENV === "production") {
        // Check for weak secrets
        if (process.env.JWT_SECRET?.includes("change") || process.env.JWT_SECRET?.includes("dev")) {
            errors.push("❌ JWT_SECRET appears to contain default/weak value. Change it for production!");
        }
        if (process.env.INTERNAL_HOOK_SECRET?.includes("dev") || process.env.INTERNAL_HOOK_SECRET?.includes("change")) {
            errors.push("❌ INTERNAL_HOOK_SECRET appears to contain default value. Change it for production!");
        }
        if (process.env.CRON_SECRET?.includes("default") || process.env.CRON_SECRET?.includes("dev")) {
            errors.push("❌ CRON_SECRET appears to contain default/weak value. Change it for production!");
        }
        if (!process.env.AI_CONFIG_ENCRYPTION_KEY && !process.env.APP_ENCRYPTION_KEY) {
            errors.push("❌ AI_CONFIG_ENCRYPTION_KEY (or APP_ENCRYPTION_KEY) is required in production for encrypted AI config storage");
        }
        if (
            !process.env.WORKFLOW_SECRET_ENCRYPTION_KEY &&
            !process.env.APP_ENCRYPTION_KEY &&
            !process.env.AI_CONFIG_ENCRYPTION_KEY
        ) {
            errors.push("❌ WORKFLOW_SECRET_ENCRYPTION_KEY (or APP_ENCRYPTION_KEY) is required in production for encrypted workflow secret storage");
        }
        if (!process.env.REDIS_URL) {
            errors.push("❌ REDIS_URL is required in production for distributed locking and rate limiting");
        }

        // Ensure HTTPS in production
        if (process.env.SITE_URL && !process.env.SITE_URL.startsWith("https://")) {
            warnings.push("⚠️  SITE_URL should use HTTPS in production");
        }
    }

    if (["1", "true", "yes"].includes((process.env.AIR_GAPPED_MODE || "").toLowerCase())) {
        warnings.push("⚠️  AIR_GAPPED_MODE is enabled: external integrations (AI/cloud/third-party webhooks) should be disabled");
    }

    // S3 Validation
    if (process.env.STORAGE_TYPE === "s3") {
        if (!process.env.STORAGE_BUCKET) errors.push("❌ STORAGE_BUCKET is required when STORAGE_TYPE is 's3'");
        if (!process.env.STORAGE_ACCESS_KEY_ID) errors.push("❌ STORAGE_ACCESS_KEY_ID is required when STORAGE_TYPE is 's3'");
        if (!process.env.STORAGE_SECRET_ACCESS_KEY) errors.push("❌ STORAGE_SECRET_ACCESS_KEY is required when STORAGE_TYPE is 's3'");
        // Endpoint is optional for AWS S3 but required for MinIO/R2/Garage/etc.
    }

    // Print results
    if (warnings.length > 0) {
        logger.info("\n⚠️  Warnings:");
        warnings.forEach((w) => logger.info(w));
    }

    if (errors.length > 0) {
        logger.error("\n❌ Environment validation failed:");
        errors.forEach((e) => logger.error(e));
        logger.error("\nPlease fix the above errors before starting the application.");
        logger.error("See .env.example for reference.\n");

        if (exitOnError) {
            process.exit(1);
        }
        return false;
    }

    logger.info("✅ Environment validation passed\n");
    return true;
}

// Auto-run validation if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    validateEnvironment();
}
