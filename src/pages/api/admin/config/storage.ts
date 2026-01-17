import { updateStorageConfig } from "@/lib/storage";
import type { APIRoute } from "astro";

// GET /api/admin/config/storage
export const GET: APIRoute = async ({ locals }) => {
    // Check admin permissions
    const user = locals.user;
    if (!user?.isAdmin) {
        return new Response("Unauthorized", { status: 403 });
    }

    const { getDatabase, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const db = getDatabase();

    // Fetch from DB
    const configRow = await db.query.systemConfig.findFirst({
        where: eq(schema.systemConfig.key, "storage_config")
    });

    // Fallback to current env if no DB config
    let config = {};
    if (configRow) {
        config = JSON.parse(configRow.value);
    } else {
        config = {
            type: process.env.STORAGE_TYPE || 'local',
            basePath: process.env.STORAGE_PATH || './data/storage',
            bucket: process.env.STORAGE_BUCKET,
            region: process.env.STORAGE_REGION,
            endpoint: process.env.STORAGE_ENDPOINT,
            rcloneRemote: process.env.STORAGE_RCLONE_REMOTE,
            // Don't leak secrets in GET unless needed for form population (be careful!)
            // For editing, we might need them or leave them blank to indicate "unchanged"
        };
    }

    return new Response(JSON.stringify(config), {
        headers: { "Content-Type": "application/json" }
    });
};

// POST /api/admin/config/storage
export const POST: APIRoute = async ({ request, locals }) => {
    // Check admin permissions
    const user = locals.user;
    if (!user?.isAdmin) {
        return new Response("Unauthorized", { status: 403 });
    }

    let config;
    try {
        config = await request.json();
    } catch (e) {
        return new Response("Invalid JSON", { status: 400 });
    }

    // Mask secrets if they are placeholder values (e.g. "*****")
    // Logic: IF password is "*****", try to fetch existing config and keep old value.
    // For now, let's assume UI sends full value or empty string for "no change"

    // 1. Test Connection?
    // We can create a temporary adapter and try `list` or `exists`
    // TODO: Implement test logic here or separately.
    // For now, simple save.

    try {
        await updateStorageConfig(config, user.id);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
