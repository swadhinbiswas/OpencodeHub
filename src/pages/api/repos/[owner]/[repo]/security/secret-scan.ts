import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { canWriteRepo } from "@/lib/permissions";
import { resolveRepoPath } from "@/lib/git-storage";
import { scanRepositoryForSecrets } from "@/lib/secret-scanning";
import { withErrorHandler } from "@/lib/errors";
import { unauthorized, notFound, forbidden, success } from "@/lib/api";

export const POST: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) return unauthorized();

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repoOwner = await db.query.users.findFirst({
        where: eq(schema.users.username, ownerName!),
    });

    if (!repoOwner) return notFound("Not Found");

    const repo = await db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, repoOwner.id),
            eq(schema.repositories.name, repoName!)
        ),
    });

    if (!repo) return notFound("Not Found");
    if (!(await canWriteRepo(user.id, repo))) return forbidden();

    const repoPath = await resolveRepoPath(repo.diskPath);
    const result = await scanRepositoryForSecrets({
        repoPath,
        repositoryId: repo.id,
    });

    return success({
        commitSha: result.commitSha,
        findings: result.findings,
    });
});
