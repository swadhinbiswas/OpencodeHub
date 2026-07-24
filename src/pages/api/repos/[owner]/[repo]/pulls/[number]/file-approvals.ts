import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { approveFile } from "@/lib/partial-file-approvals";
import { resolveRepoPath } from "@/lib/git-storage";
import { getRepoPath, getChangedFiles } from "@/lib/git";
import { canWriteRepo } from "@/lib/permissions";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { checkPathPermissions } from "@/lib/path-scoping";

async function getRepository(owner: string, repo: string) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const ownerUser = await db.query.users.findFirst({
        where: eq(schema.users.username, owner),
    });

    if (!ownerUser) return null;

    return db.query.repositories.findFirst({
        where: and(
            eq(schema.repositories.ownerId, ownerUser.id),
            eq(schema.repositories.name, repo)
        ),
    });
}

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
    const { owner, repo, number } = params;

    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepository(owner, repo);

    if (!repository) return notFound("Repository not found");

    if (!(await canWriteRepo(locals.user?.id, repository))) {
        return notFound("Repository not found");
    }

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.number, parseInt(number))
        ),
    });

    if (!pr) return notFound("Pull request not found");

    const repoPath = await resolveRepoPath(getRepoPath(owner, repo));
    const changedFiles = await getChangedFiles(repoPath, pr.baseBranch, pr.headBranch);
    const scopedUserId = locals.user?.id || "__anonymous__";
    const readScope = await checkPathPermissions(scopedUserId, repository.id, changedFiles, "read");
    const denied = new Set(readScope.deniedPaths || []);
    const visibleFiles = changedFiles.filter((path) => !denied.has(path));

    const approvals = await db.query.fileApprovals.findMany({
        where: eq(schema.fileApprovals.pullRequestId, pr.id),
        with: { approvedBy: { columns: { username: true } } },
    });

    const approvalMap = new Map<string, { approvers: string[]; stale: boolean }>();

    for (const approval of approvals) {
        if (!approvalMap.has(approval.path)) {
            approvalMap.set(approval.path, { approvers: [], stale: false });
        }
        const entry = approvalMap.get(approval.path)!;
        if (approval.approvedBy?.username) {
            entry.approvers.push(approval.approvedBy.username);
        }
        if (approval.commitSha !== pr.headSha) {
            entry.stale = true;
        }
    }

    const files = visibleFiles.map((path) => {
        const entry = approvalMap.get(path);
        const stale = entry?.stale || false;
        const approvers = entry?.approvers || [];
        return {
            path,
            approvers,
            stale,
            approved: approvers.length > 0 && !stale,
        };
    });

    return success({
        files,
        hiddenPaths: denied.size,
        allApproved: files.length > 0 && files.every((file) => file.approved),
    });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
    const { owner, repo, number } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepository(owner, repo);

    if (!repository) return notFound("Repository not found");

    if (!(await canWriteRepo(user.id, repository))) {
        return forbidden();
    }

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.number, parseInt(number))
        ),
    });

    if (!pr) return notFound("Pull request not found");
    if (pr.state !== "open") return badRequest("Pull request is not open");

    const body = await request.json();
    const { path, comment } = body || {};

    if (!path) return badRequest("Missing file path");

    const permission = await checkPathPermissions(user.id, repository.id, [path], "write");
    if (!permission.allowed) {
        return forbidden(permission.reason || "Insufficient path permissions for this file");
    }

    const approval = await approveFile({
        pullRequestId: pr.id,
        path,
        approvedById: user.id,
        comment: comment || undefined,
    });

    return success({ approval });
});

export const DELETE: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
    const { owner, repo, number } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const url = new URL(request.url);
    const path = url.searchParams.get("path");
    
    if (!path) return badRequest("Missing file path");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepository(owner, repo);

    if (!repository) return notFound("Repository not found");

    const pr = await db.query.pullRequests.findFirst({
        where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.number, parseInt(number))
        ),
    });

    if (!pr) return notFound("Pull request not found");

    await db.delete(schema.fileApprovals).where(
        and(
            eq(schema.fileApprovals.pullRequestId, pr.id),
            eq(schema.fileApprovals.path, path),
            eq(schema.fileApprovals.approvedById, user.id)
        )
    );

    return success({ success: true });
});
