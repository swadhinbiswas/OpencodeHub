/**
 * Environment Variable Validation
 * Run this at application startup to ensure all required configuration is present
 */

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
    },
    {
        name: "STORAGE_PATH",
        required: false,
        defaultValue: "./data/storage",
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
];

export function validateEnvironment(exitOnError: boolean = true): boolean {
    console.log("🔍 Validating environment configuration...");

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

        // Ensure HTTPS in production
        if (process.env.SITE_URL && !process.env.SITE_URL.startsWith("https://")) {
            warnings.push("⚠️  SITE_URL should use HTTPS in production");
        }
    }

    // Print results
    if (warnings.length > 0) {
        console.log("\n⚠️  Warnings:");
        warnings.forEach((w) => console.log(w));
    }

    if (errors.length > 0) {
        console.error("\n❌ Environment validation failed:");
        errors.forEach((e) => console.error(e));
        console.error("\nPlease fix the above errors before starting the application.");
        console.error("See .env.example for reference.\n");

        if (exitOnError) {
            process.exit(1);
        }
        return false;
    }

    console.log("✅ Environment validation passed\n");
    return true;
}

// Auto-run validation if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    validateEnvironment();
}
