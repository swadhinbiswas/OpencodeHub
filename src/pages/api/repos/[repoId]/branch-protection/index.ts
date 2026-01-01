import { getDatabase, schema } from "@/db";
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { BranchProtectionSchema } from "@/lib/validation";
import { applyRateLimit } from "@/middleware/rate-limit";
import { generateId } from "@/lib/utils";

// GET /api/repos/[repoId]/branch-protection - List rules
export const GET: APIRoute = async ({ params, request }) => {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(request, "api");
    if (rateLimitResponse) return rateLimitResponse;

    const { repoId } = params;
    if (!repoId) {
        return new Response("Missing repoId", { status: 400 });
    }

    const db = getDatabase();
    const rules = await db.query.branchProtection.findMany({
        where: eq(schema.branchProtection.repositoryId, repoId),
    });

    return new Response(JSON.stringify(rules), {
        headers: { "Content-Type": "application/json" },
    });
};

// POST /api/repos/[repoId]/branch-protection - Create rule
export const POST: APIRoute = async ({ params, request }) => {
    const { repoId } = params;
    if (!repoId) {
        return new Response("Missing repoId", { status: 400 });
    }

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response("Invalid JSON", { status: 400 });
    }

    // Validate input with Zod
    const validation = BranchProtectionSchema.safeParse(body);
    if (!validation.success) {
        return new Response(
            JSON.stringify({
                error: "Validation failed",
                details: validation.error.errors,
            }),
            { status: 400 }
        );
    }

    const data = validation.data;

    const db = getDatabase();

    // Check active user? For now assuming admin/owner permission checked by middleware or UI context (TODO)

    const id = generateId("rule");

    await db.insert(schema.branchProtection).values({
        id,
        repositoryId: repoId,
        pattern: data.pattern,
        requiresPr: data.requiresPr ?? false,
        requiredApprovals: data.requiredApprovals ?? 1,
        dismissStaleReviews: data.dismissStaleReviews ?? false,
        requireCodeOwnerReviews: data.requireCodeOwnerReviews ?? false,
        allowForcePushes: data.allowForcePushes ?? false,
        active: data.active ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // createdById: user.id // TODO: Get user from context
    });

    return new Response(JSON.stringify({ id }), { status: 201 });
};
