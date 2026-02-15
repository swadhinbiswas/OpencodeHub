import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { canWriteRepo } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, notFound, success, unauthorized, forbidden } from "@/lib/api";
import { rebaseStack, stackNeedsRebase } from "@/lib/stack-rebase";

export const POST: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName, stackId } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!ownerName || !repoName || !stackId) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const owner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName),
    });

    if (!owner) return notFound("Repository not found");

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, owner.id),
            eq(schema.repositories.name, repoName)
        ),
    });

    if (!repo) return notFound("Repository not found");
    if (!(await canWriteRepo(user.id, repo))) return forbidden();

    const stack = await db.query.prStacks.findFirst({
        where: and(
            eq(schema.prStacks.id, stackId),
            eq(schema.prStacks.repositoryId, repo.id)
        ),
    });

    if (!stack) return notFound("Stack not found");

    const status = await stackNeedsRebase(stackId);
    if (!status.needsRebase) {
        return success({
            needsRebase: false,
            behindBy: status.behindBy,
            message: "Stack is already up to date",
        });
    }

    const result = await rebaseStack(stackId);

    return success({
        needsRebase: status.needsRebase,
        behindBy: status.behindBy,
        result,
    });
});
