import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { withErrorHandler } from "@/lib/errors";
import { approveFile } from "@/lib/partial-file-approvals";
import { resolveRepoPath } from "@/lib/git-storage";
import { getRepoPath, getChangedFiles } from "@/lib/git";
import { canReadRepo } from "@/lib/permissions";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";

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

    if (!(await canReadRepo(locals.user?.id, repository))) {
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

    const files = changedFiles.map((path) => {
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

    return success({ files, allApproved: files.length > 0 && files.every((file) => file.approved) });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
    const { owner, repo, number } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!owner || !repo || !number) return badRequest("Missing parameters");

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const repository = await getRepository(owner, repo);

    if (!repository) return notFound("Repository not found");

    if (!(await canReadRepo(user.id, repository))) {
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

    const approval = await approveFile({
        pullRequestId: pr.id,
        path,
        approvedById: user.id,
        comment: comment || undefined,
    });

    return success({ approval });
});
