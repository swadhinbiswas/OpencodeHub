import { syncStorage, restoreStorage, listRemotes } from "@/lib/sync-storage";
import type { APIRoute } from "astro";
import { withErrorHandler } from "@/lib/errors";
import { forbidden, success, badRequest } from "@/lib/api";

// GET /api/admin/sync
// List remotes
export const GET: APIRoute = withErrorHandler(async ({ locals }) => {
    const user = locals.user;
    if (!user?.isAdmin) return forbidden();

    const remotes = await listRemotes();
    return success({ remotes });
});

// POST /api/admin/sync
// Trigger sync
export const POST: APIRoute = withErrorHandler(async ({ request, locals }) => {
    const user = locals.user;
    if (!user?.isAdmin) return forbidden();

    const body = await request.json();
    const { action, remote, deleteData } = body;

    if (!remote) return badRequest("Remote name required");

    const options = {
        delete: deleteData !== false,
        verbose: true
    };

    let result;
    if (action === "sync" || action === "backup") {
        // Sync LOCAL -> REMOTE
        // We assume local storage path is ./data/storage
        result = await syncStorage("./data/storage", `${remote}:opencodehub-backup`, options);
    } else if (action === "restore") {
        // Sync REMOTE -> LOCAL
        result = await restoreStorage(`${remote}:opencodehub-backup`, "./data/storage", options);
    } else {
        return badRequest("Invalid action. Use 'sync' or 'restore'");
    }

    if (result.success) {
        return success({ message: "Sync successful", output: result.output });
    } else {
        return badRequest(`Sync failed: ${result.error || result.output}`);
    }
});
