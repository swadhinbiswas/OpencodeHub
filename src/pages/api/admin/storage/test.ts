import { createStorageAdapter } from "@/lib/storage";
import type { APIRoute } from "astro";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { badRequest, forbidden, success } from "@/lib/api";

export const POST: APIRoute = withErrorHandler(async ({ request, locals }) => {
    const user = locals.user;
    if (!user?.isAdmin) {
        return forbidden();
    }

    let config;
    try {
        config = await request.json();
    } catch (e) {
        return badRequest("Invalid JSON");
    }

    if (!config.type) return badRequest("Type required");

    const adapter = createStorageAdapter(config);
    const testKey = `test-connection-${Date.now()}.txt`;
    await adapter.put(testKey, Buffer.from("test connection"));
    await adapter.delete(testKey);

    logger.info({ adminId: user.id, storageType: config.type }, "Storage connection test successful");

    return success({ success: true });
});
