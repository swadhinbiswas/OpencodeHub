import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { APIRoute } from "astro";

// GET /api/admin/config/general
export const GET: APIRoute = async ({ request, locals }) => {
    const user = locals.user;
    if (!user?.isAdmin) {
        return new Response("Unauthorized", { status: 403 });
    }

    const db = getDatabase();

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

    return new Response(JSON.stringify(config), {
        headers: { "Content-Type": "application/json" }
    });
};

// POST /api/admin/config/general
export const POST: APIRoute = async ({ request, locals }) => {
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

    // Save to DB
    const db = getDatabase();
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
                updatedAt: new Date().toISOString(),
                updatedById: user.id
            }
        });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
};
