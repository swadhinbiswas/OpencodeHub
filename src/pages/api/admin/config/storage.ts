import {
    updateStorageConfig,
    resetStorage,
    checkStorageHealth,
    getStorageConfig,
    createStorageAdapter,
    type StorageConfig,
} from "@/lib/storage";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { APIRoute } from "astro";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { forbidden, success, badRequest, serverError } from "@/lib/api";

// GET /api/admin/config/storage
export const GET: APIRoute = withErrorHandler(async ({ locals, url }) => {
    // Check admin permissions
    const user = locals.user;
    if (!user?.isAdmin) {
        return forbidden();
    }

    // Optional: run health check if requested
    const runCheck = url.searchParams.get("check") === "true";
    if (runCheck) {
        const health = await checkStorageHealth();
        return success(health);
    }

    const { getDatabase, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Fetch from DB
    const configRow = await db.query.systemConfig.findFirst({
        where: eq(schema.systemConfig.key, "storage_config")
    });

    // Fallback to current env if no DB config
    let config = {};
    let source = "env";

    if (configRow) {
        config = JSON.parse(configRow.value);
        source = "database";
    } else {
        config = getStorageConfig();
    }

    return success({
        config,
        source,
        envPriority: process.env.STORAGE_ENV_PRIORITY === "true"
    });
});

// POST /api/admin/config/storage
export const POST: APIRoute = withErrorHandler(async ({ request, locals }) => {
    // Check admin permissions
    const user = locals.user;
    if (!user?.isAdmin) {
        return forbidden();
    }

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return badRequest("Invalid JSON");
    }

    const { action } = body;
    const bodyConfig = body?.config ?? body;

    const normalizeConfig = (input: unknown): StorageConfig => {
        if (!input || typeof input !== "object" || Array.isArray(input)) {
            throw new Error("Config required");
        }
        const cfg = input as Partial<StorageConfig>;
        if (!cfg.type) {
            throw new Error("Storage type required");
        }
        if (cfg.type !== "local" && cfg.type !== "s3") {
            throw new Error(
                `Unsupported storage type '${cfg.type}'. Supported types are: local, s3.`,
            );
        }

        const sanitized: StorageConfig = {
            type: cfg.type,
            basePath: typeof cfg.basePath === "string"
                ? cfg.basePath
                : cfg.type === "local"
                    ? "./data/storage"
                    : "",
            bucket: typeof cfg.bucket === "string" ? cfg.bucket : undefined,
            region: typeof cfg.region === "string" ? cfg.region : undefined,
            endpoint: typeof cfg.endpoint === "string" ? cfg.endpoint : undefined,
            accessKeyId: typeof cfg.accessKeyId === "string" ? cfg.accessKeyId : undefined,
            secretAccessKey: typeof cfg.secretAccessKey === "string" ? cfg.secretAccessKey : undefined,
        };
        return sanitized;
    };

    if (action === "test") {
        let testConfig: StorageConfig;
        try {
            testConfig = normalizeConfig(bodyConfig);
        } catch (error: any) {
            return badRequest(error?.message || "Invalid storage config");
        }

        try {
            const adapter = createStorageAdapter(testConfig);
            const testKey = `admin-storage-test/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;

            await adapter.put(testKey, Buffer.from("storage test"));
            await adapter.delete(testKey).catch(() => { });

            return success({
                success: true,
                healthy: true,
                type: testConfig.type,
            });
        } catch (error: any) {
            logger.warn({ error, storageType: testConfig.type }, "Storage config test failed");
            return success({
                success: false,
                healthy: false,
                type: testConfig.type,
                error: error?.message || "Storage connection test failed",
            });
        }
    }

    if (action === "reset") {
        resetStorage();
        return success({ message: "Storage cache cleared" });
    }

    if (action && action !== "save") {
        return badRequest("Unknown action");
    }

    let config: StorageConfig;
    try {
        config = normalizeConfig(bodyConfig);
    } catch (error: any) {
        return badRequest(error?.message || "Invalid storage config");
    }

    await updateStorageConfig(config, user.id);
    resetStorage(); // Force reload

    logger.info({ adminId: user.id }, "Storage config updated");

    return success({ success: true });
});

// DELETE /api/admin/config/storage
// Clears the database config, reverting to environment variables
export const DELETE: APIRoute = withErrorHandler(async ({ locals }) => {
    const user = locals.user;
    if (!user?.isAdmin) {
        return forbidden();
    }

    const { getDatabase, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    await db.delete(schema.systemConfig)
        .where(eq(schema.systemConfig.key, "storage_config"));

    resetStorage(); // Force reload from env

    logger.info({ adminId: user.id }, "Storage config deleted (reverted to env)");

    return success({ success: true, message: "Reverted to environment configuration" });
});
