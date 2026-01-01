import { createStorageAdapter } from "@/lib/storage";
import type { APIRoute } from "astro";

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

    if (!config.type) return new Response(JSON.stringify({ error: "Type required" }), { status: 400 });

    try {
        const adapter = createStorageAdapter(config);
        const testKey = `test-connection-${Date.now()}.txt`;
        await adapter.put(testKey, Buffer.from("test connection"));
        await adapter.delete(testKey);

        return new Response(JSON.stringify({ success: true }));
    } catch (err: any) {
        console.error("Storage test failed", err);
        return new Response(JSON.stringify({ success: false, error: err.message }));
    }
};
