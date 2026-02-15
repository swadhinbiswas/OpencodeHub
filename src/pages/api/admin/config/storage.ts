import { updateStorageConfig, resetStorage, checkStorageHealth, getStorageConfig } from "@/lib/storage";
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

    const { action, config } = body;

    if (action === "test") {
        // TODO: Test the provided config without saving
        // For now, we only support testing current config via GET ?check=true
        return badRequest("Test config action not yet implemented");
    }

    if (action === "reset") {
        resetStorage();
        return success({ message: "Storage cache cleared" });
    }

    if (!config) {
        return badRequest("Config required");
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
