
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
import { transitionIssue } from "@/lib/issue-workflows";
import { setFieldValue, getCustomFields } from "@/lib/custom-fields";
import { generateId } from "@/lib/utils";

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
        if (!repoData) return notFound("Repository not found");

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
        const { title, description, state, type, parentId, labels, assigneeIds, milestoneId, statusId, customFields } = body;

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

        // Handle milestone assignment (WS2-02: issues.milestoneId was never written)
        if (milestoneId !== undefined) {
            if (milestoneId === null) {
                updates.milestoneId = null;
            } else {
                const milestone = await db.query.milestones.findFirst({
                    where: and(
                        eq(schema.milestones.repositoryId, repoData.repository.id),
                        eq(schema.milestones.id, milestoneId)
                    )
                });
                if (!milestone) return badRequest("Milestone not found in this repository");
                updates.milestoneId = milestone.id;
            }
        }

        // Handle workflow state transition (WS2-03: transitionIssue was never called)
        if (statusId !== undefined) {
            if (statusId === null) {
                updates.statusId = null;
            } else {
                const transition = await transitionIssue({
                    issueId: issue.id,
                    toStateId: statusId,
                    userId: user.userId,
                });
                if (!transition.success) return badRequest(transition.error || "Invalid state transition");
                updates.statusId = statusId;
                if (updates.state === undefined) {
                    // transitionIssue already set open/closed state; keep statusId consistent
                }
            }
        }

        if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date();
            await db.update(issues)
                .set(updates)
                .where(eq(issues.id, issue.id));
        }

        // Handle assignee updates (WS2-01: issue assignees were never settable)
        if (assigneeIds !== undefined) {
            if (!Array.isArray(assigneeIds)) return badRequest("assigneeIds must be an array");
            // Verify assignees exist
            const valid: string[] = [];
            for (const assigneeId of assigneeIds) {
                const assignee = await db.query.users.findFirst({
                    where: eq(schema.users.id, assigneeId)
                });
                if (assignee) valid.push(assigneeId);
            }
            await db.delete(issueAssignees).where(eq(issueAssignees.issueId, issue.id));
            if (valid.length > 0) {
                await db.insert(issueAssignees).values(
                    valid.map((userId) => ({
                        id: generateId(),
                        issueId: issue.id,
                        userId,
                        assignedAt: new Date(),
                    }))
                );
            }
        }

        // Handle custom field values (WS2-04: setFieldValue was never callable)
        if (customFields !== undefined && typeof customFields === "object") {
            const repoFields = await getCustomFields(repoData.repository.id);
            const repoFieldIds = new Set(repoFields.map((f) => f.id));
            for (const [fieldId, value] of Object.entries(customFields)) {
                if (!repoFieldIds.has(fieldId)) return badRequest(`Custom field ${fieldId} does not exist in this repository`);
                try {
                    await setFieldValue({ issueId: issue.id, fieldId, value: value as any });
                } catch (err) {
                    logger.error({ err, fieldId, issueId: issue.id }, "Failed to set custom field value");
                    return badRequest(`Failed to set custom field ${fieldId}`);
                }
            }
        }

        // Handle label updates
        if (Array.isArray(labels)) {
            // Remove existing labels
            await db.delete(issueLabels).where(eq(issueLabels.issueId, issue.id));
            // Add new labels
            if (labels.length > 0) {
                const labelInserts = labels.map((labelId: string) => ({
                    id: generateId(),
                    issueId: issue.id,
                    labelId: labelId,
                }));
                await db.insert(issueLabels).values(labelInserts);
            }
        }

        if (title !== undefined || description !== undefined) {
            const linkText = `${title ?? issue.title} ${description ?? issue.body ?? ""}`;
            try {
                await autoLinkCrossRepoIssues(issue.id, linkText, user.userId);
            } catch (error) {
                logger.warn({ issueId: issue.id, error }, "Failed to auto-link cross-repo issues");
            }
        }

        // Trigger automation
        import("@/lib/automations").then(({ triggerAutomation }) => {
            let triggerType: any = "issue_updated";
            if (state === "closed" && issue.state !== "closed") {
                triggerType = "issue_closed";
            } else if (state === "open" && issue.state === "closed") {
                triggerType = "issue_reopened";
            } else if (body.statusId !== undefined) {
                // We're updating a custom status! Wait, `PATCH` doesn't currently parse `statusId` here, but let's just use `issue_updated` as default.
                // Wait, if it's just an update:
                triggerType = "issue_updated";
            }
            
            triggerAutomation(repoData.repository.id, triggerType, {
                issueId: issue.id,
                userId: user.userId,
            }).catch((err) => logger.error({ err }, "Failed to trigger automations for issue update"));
        });

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
