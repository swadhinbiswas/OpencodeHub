import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import type { APIRoute } from "astro";
import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { forbidden, success, badRequest } from "@/lib/api";

// GET /api/admin/config/general
export const GET: APIRoute = withErrorHandler(async ({ locals }) => {
    const user = locals.user;
    if (!user?.isAdmin) {
        return forbidden();
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Fetch configs
    const configs = await db.query.systemConfig.findMany({
        where: eq(schema.systemConfig.key, "general_config")
    });

    const configRow = configs[0];

    // Default
    let config = {
        siteName: "OpenCodeHub",
        siteDescription: "Open Source Git Hosting",
        allowSignups: true,
        smtpHost: "",
        smtpPort: 587,
        smtpUser: "",
        smtpFrom: "noreply@opencodehub.com"
        // Password not returned usually
    };

    if (configRow) {
        config = { ...config, ...JSON.parse(configRow.value) };
    }

    return success(config);
});

// POST /api/admin/config/general
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

    // Save to DB
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const value = JSON.stringify(config);

    await db.insert(schema.systemConfig)
        .values({
            key: "general_config",
            value,
            updatedById: user.id
        })
        .onConflictDoUpdate({
            target: schema.systemConfig.key,
            set: {
                value,
                updatedAt: new Date(),
                updatedById: user.id
            }
        });

    logger.info({ adminId: user.id }, "General config updated");

    return success({ success: true });
});
