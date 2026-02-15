
import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, badRequest, success, notFound, serverError } from "@/lib/api";
import { issues, issueLabels, issueAssignees } from "@/db/schema";
import { getRepoAndUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { autoLinkCrossRepoIssues } from "@/lib/cross-repo-issues";

// PATCH: Update an issue
export const PATCH: APIRoute = async ({ request, params }) => {
    try {
        const { owner, repo, number } = params;
        if (!owner || !repo || !number) return badRequest("Missing parameters");

        const user = await getUserFromRequest(request);
        if (!user) return unauthorized();

        const db = getDatabase() as NodePgDatabase<typeof schema>;

        // Check repo access
        const repoData = await getRepoAndUser(request, owner, repo);
        if (!repoData || repoData.permission === "none") return notFound("Repository not found");

        if (repoData.permission === "read") return unauthorized("Write access required");

        // Find the issue
        const issue = await db.query.issues.findFirst({
            where: and(
                eq(issues.repositoryId, repoData.repository.id),
                eq(issues.number, parseInt(number))
            )
        });

        if (!issue) return notFound("Issue not found");

        // Parse body
        const body = await request.json();
        const { title, description, state, type, parentId } = body;

        // Prepare updates
        const updates: any = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.body = description;
        if (state !== undefined) {
            updates.state = state;
            if (state === "closed") {
                updates.closedAt = new Date();
                updates.closedById = user.userId;
            } else {
                updates.closedAt = null;
                updates.closedById = null;
            }
        }
        if (type !== undefined) updates.type = type;

        // Handle parentId update (for sub-tasks)
        if (parentId !== undefined) {
            if (parentId === null) {
                updates.parentId = null;
            } else {
                // Verify parent exists and is in same repo
                const parent = await db.query.issues.findFirst({
                    where: and(
                        eq(issues.repositoryId, repoData.repository.id),
                        eq(issues.number, parseInt(parentId))
                    )
                });
                if (!parent) return badRequest("Parent issue not found");
                updates.parentId = parent.id;
            }
        }

        if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date();
            await db.update(issues)
                .set(updates)
                .where(eq(issues.id, issue.id));
        }

        if (title !== undefined || description !== undefined) {
            const linkText = `${title ?? issue.title} ${description ?? issue.body ?? ""}`;
            try {
                await autoLinkCrossRepoIssues(issue.id, linkText, user.userId);
            } catch (error) {
                logger.warn({ issueId: issue.id, error }, "Failed to auto-link cross-repo issues");
            }
        }

        logger.info({ userId: user.userId, issueId: issue.id }, "Issue updated");

        return success({ message: "Issue updated successfully" });

    } catch (error) {
        logger.error({ err: error }, "Failed to update issue");
        return serverError("Failed to update issue");
    }
};

// GET: Get single issue details (API)
export const GET: APIRoute = async ({ request, params }) => {
    try {
        const { owner, repo, number } = params;
        if (!owner || !repo || !number) return badRequest("Missing parameters");

        const user = await getUserFromRequest(request); // Optional for public repos, but good to check context

        const db = getDatabase();

        // Check repo access
        const repoData = await getRepoAndUser(request, owner, repo);
        if (!repoData) return notFound("Repository not found");
        // If public, repoData exists even if user is null? Need to check permissions logic deeply but assuming getRepoAndUser handles public check or returns permission 'read' at least.

        // Find the issue
        const issue = await db.query.issues.findFirst({
            where: and(
                eq(issues.repositoryId, repoData.repository.id),
                eq(issues.number, parseInt(number))
            ),
            with: {
                author: true,
                labels: { with: { label: true } },
                assignees: { with: { user: true } },
                parent: true,
                children: true
            }
        });

        if (!issue) return notFound("Issue not found");

        return success({ issue });

    } catch (error) {
        logger.error({ err: error }, "Failed to get issue");
        return serverError("Failed to get issue");
    }
};
