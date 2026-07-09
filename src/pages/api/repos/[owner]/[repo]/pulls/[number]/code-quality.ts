import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getRepoAndUser } from "@/lib/auth";
import { badRequest, notFound, serverError, success, unauthorized } from "@/lib/api";
import { logger } from "@/lib/logger";

export const GET: APIRoute = async ({ request, params }) => {
    try {
        const { owner, repo, number } = params;
        if (!owner || !repo || !number) return badRequest("Missing parameters");

        const db = getDatabase();
        const repoData = await getRepoAndUser(request, owner, repo);
        if (!repoData) return notFound("Repository not found");

        const pr = await db.query.pullRequests.findFirst({
            where: and(
                eq(schema.pullRequests.repositoryId, repoData.repository.id),
                eq(schema.pullRequests.number, parseInt(number))
            )
        });

        if (!pr) return notFound("Pull request not found");

        const qualityIssues = await db.query.codeQualityIssues?.findMany({
            where: and(
                eq(schema.codeQualityIssues.repositoryId, repoData.repository.id),
                eq(schema.codeQualityIssues.commitSha, pr.headSha)
            )
        }) || [];

        return success(qualityIssues);

    } catch (error) {
        logger.error({ err: error }, "Failed to fetch code quality issues");
        return serverError("Failed to fetch code quality issues");
    }
};
