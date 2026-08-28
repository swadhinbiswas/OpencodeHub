/**
 * GraphQL Resolvers
 * Query and mutation resolvers for OpenCodeHub API
 */

import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, like, desc, sql, count, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { compareBranches, getCommit, mergeBranch } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { canWriteRepo } from "@/lib/permissions";
import { evaluateGates } from "@/lib/ci-gates";
import { closeLinkedIssuesOnMerge } from "@/lib/pr-issue-linking";

// Context type for resolvers
export interface GraphQLContext {
    db: NodePgDatabase<typeof schema>;
    userId?: string;
    user?: typeof schema.users.$inferSelect;
}

// Offset-based cursor helpers (GitHub-style opaque base64 cursors)
const CURSOR_PREFIX = "cursor:";

function encodeCursor(offset: number): string {
    return Buffer.from(`${CURSOR_PREFIX}${offset}`).toString("base64");
}

function decodeCursor(cursor?: string | null): number | null {
    if (!cursor) return null;
    try {
        const decoded = Buffer.from(cursor, "base64").toString("utf8");
        if (!decoded.startsWith(CURSOR_PREFIX)) return null;
        const offset = Number.parseInt(decoded.slice(CURSOR_PREFIX.length), 10);
        if (!Number.isInteger(offset) || offset < 0) return null;
        return offset;
    } catch {
        return null;
    }
}

// Helper to create page info. Callers fetch first+1 rows and pass the fetched
// row count as `total`, yielding an honest hasNextPage without a COUNT query.
function createPageInfo(
    nodes: any[],
    first: number,
    after?: string | null,
    total?: number
) {
    const offset = decodeCursor(after) ?? 0;
    const hasNextPage =
        typeof total === "number" ? offset + nodes.length < total : false;
    return {
        hasNextPage,
        hasPreviousPage: offset > 0,
        startCursor: nodes.length > 0 ? encodeCursor(offset) : null,
        endCursor: nodes.length > 0 ? encodeCursor(offset + nodes.length) : null,
    };
}

export const resolvers = {
    DateTime: {
        serialize: (value: Date) => value.toISOString(),
        parseValue: (value: string) => new Date(value),
    },

    Query: {
        viewer: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
            if (!ctx.userId) return null;
            return ctx.db.query.users.findFirst({
                where: eq(schema.users.id, ctx.userId),
            });
        },

        user: async (_: unknown, { username }: { username: string }, ctx: GraphQLContext) => {
            return ctx.db.query.users.findFirst({
                where: eq(schema.users.username, username),
            });
        },

        repository: async (
            _: unknown,
            { owner, name }: { owner: string; name: string },
            ctx: GraphQLContext
        ) => {
            const ownerUser = await ctx.db.query.users.findFirst({
                where: eq(schema.users.username, owner),
            });
            if (!ownerUser) return null;

            return ctx.db.query.repositories.findFirst({
                where: and(
                    eq(schema.repositories.ownerId, ownerUser.id),
                    eq(schema.repositories.name, name)
                ),
            });
        },

        search: async (
            _: unknown,
            { query, type, first = 10, after }: {
                query: string;
                type: string;
                first: number;
                after?: string | null;
            },
            ctx: GraphQLContext
        ) => {
            const searchTerm = `%${query}%`;
            const offset = decodeCursor(after) ?? 0;

            switch (type) {
                case "REPOSITORY": {
                    const repos = await ctx.db.query.repositories.findMany({
                        where: like(schema.repositories.name, searchTerm),
                        limit: first + 1,
                        offset,
                    });
                    const nodes = repos.slice(0, first);
                    return {
                        nodes,
                        pageInfo: createPageInfo(nodes, first, after, repos.length),
                        totalCount: nodes.length,
                    };
                }

                case "USER": {
                    const users = await ctx.db.query.users.findMany({
                        where: like(schema.users.username, searchTerm),
                        limit: first + 1,
                        offset,
                    });
                    const nodes = users.slice(0, first);
                    return {
                        nodes,
                        pageInfo: createPageInfo(nodes, first, after, users.length),
                        totalCount: nodes.length,
                    };
                }

                case "PULL_REQUEST": {
                    const prs = await ctx.db.query.pullRequests.findMany({
                        where: like(schema.pullRequests.title, searchTerm),
                        limit: first + 1,
                        offset,
                    });
                    const nodes = prs.slice(0, first);
                    return {
                        nodes,
                        pageInfo: createPageInfo(nodes, first, after, prs.length),
                        totalCount: nodes.length,
                    };
                }

                default:
                    return {
                        nodes: [],
                        pageInfo: createPageInfo([], first, after),
                        totalCount: 0,
                    };
            }
        },
    },

    User: {
        repositories: async (
            user: typeof schema.users.$inferSelect,
            { first = 10, after }: { first: number; after?: string | null },
            ctx: GraphQLContext
        ) => {
            const offset = decodeCursor(after) ?? 0;
            const repos = await ctx.db.query.repositories.findMany({
                where: eq(schema.repositories.ownerId, user.id),
                limit: first + 1,
                offset,
                orderBy: [desc(schema.repositories.updatedAt)],
            });
            const nodes = repos.slice(0, first);
            return {
                nodes,
                pageInfo: createPageInfo(nodes, first, after, repos.length),
                totalCount: nodes.length,
            };
        },

        pullRequests: async (
            user: typeof schema.users.$inferSelect,
            { first = 10, states }: { first: number; states?: string[] },
            ctx: GraphQLContext
        ) => {
            const prs = await ctx.db.query.pullRequests.findMany({
                where: states
                    ? and(
                          eq(schema.pullRequests.authorId, user.id),
                          inArray(
                              schema.pullRequests.state,
                              states.map((s) => s.toLowerCase())
                          )
                      )
                    : eq(schema.pullRequests.authorId, user.id),
                limit: first + 1,
                orderBy: [desc(schema.pullRequests.updatedAt)],
            });

            const filtered = prs.slice(0, first);

            return {
                nodes: filtered,
                pageInfo: createPageInfo(filtered, first, null, prs.length),
                totalCount: filtered.length,
            };
        },

        organizations: async () => [],

        // ── WS5-02: issue query ─────────────────────────────────────────
        issue: async (
            _: unknown,
            { owner, repo, number }: { owner: string; repo: string; number: number },
            ctx: GraphQLContext
        ) => {
            const ownerUser = await ctx.db.query.users.findFirst({
                where: eq(schema.users.username, owner),
            });
            if (!ownerUser) return null;

            const repository = await ctx.db.query.repositories.findFirst({
                where: and(
                    eq(schema.repositories.ownerId, ownerUser.id),
                    eq(schema.repositories.name, repo),
                ),
            });
            if (!repository) return null;

            return ctx.db.query.issues.findFirst({
                where: and(
                    eq(schema.issues.repositoryId, repository.id),
                    eq(schema.issues.number, number),
                ),
            });
        },

        // ── WS5-02: organization query ──────────────────────────────────
        organization: async (
            _: unknown,
            { login }: { login: string },
            ctx: GraphQLContext
        ) => {
            return ctx.db.query.organizations.findFirst({
                where: eq(schema.organizations.name, login),
            });
        },
    },

    Repository: {
        fullName: (repo: typeof schema.repositories.$inferSelect) =>
            `${repo.ownerId}/${repo.name}`,

        owner: async (
            repo: typeof schema.repositories.$inferSelect,
            _: unknown,
            ctx: GraphQLContext
        ) => {
            return ctx.db.query.users.findFirst({
                where: eq(schema.users.id, repo.ownerId),
            });
        },

        pullRequests: async (
            repo: typeof schema.repositories.$inferSelect,
            { first = 10, states }: { first: number; states?: string[] },
            ctx: GraphQLContext
        ) => {
            const prs = await ctx.db.query.pullRequests.findMany({
                where: states
                    ? and(
                          eq(schema.pullRequests.repositoryId, repo.id),
                          inArray(
                              schema.pullRequests.state,
                              states.map((s) => s.toLowerCase())
                          )
                      )
                    : eq(schema.pullRequests.repositoryId, repo.id),
                limit: first + 1,
                orderBy: [desc(schema.pullRequests.updatedAt)],
            });

            const filtered = prs.slice(0, first);

            return {
                nodes: filtered,
                pageInfo: createPageInfo(filtered, first, null, prs.length),
                totalCount: filtered.length,
            };
        },

        issues: async (
            repo: typeof schema.repositories.$inferSelect,
            { first = 10 }: { first: number },
            ctx: GraphQLContext
        ) => {
            const issues = await ctx.db.query.issues.findMany({
                where: eq(schema.issues.repositoryId, repo.id),
                limit: first + 1,
                orderBy: [desc(schema.issues.updatedAt)],
            });
            const nodes = issues.slice(0, first);
            return {
                nodes,
                pageInfo: createPageInfo(nodes, first, null, issues.length),
                totalCount: nodes.length,
            };
        },

        stargazerCount: async (
            repo: typeof schema.repositories.$inferSelect,
            _: unknown,
            ctx: GraphQLContext
        ) => {
            const result = await ctx.db
                .select({ count: count() })
                .from(schema.repositoryStars)
                .where(eq(schema.repositoryStars.repositoryId, repo.id));
            return result[0]?.count || 0;
        },

        forkCount: async (
            repo: typeof schema.repositories.$inferSelect,
            _: unknown,
            ctx: GraphQLContext
        ) => {
            const result = await ctx.db
                .select({ count: count() })
                .from(schema.repositories)
                .where(eq(schema.repositories.forkedFromId, repo.id));
            return result[0]?.count || 0;
        },

        watcherCount: () => 0,
        languages: () => [],
        topics: () => [],
        licenseInfo: () => null,
        refs: () => ({ nodes: [], pageInfo: { hasNextPage: false, hasPreviousPage: false }, totalCount: 0 }),
        ref: () => null,
    },

    PullRequest: {
        author: async (
            pr: typeof schema.pullRequests.$inferSelect,
            _: unknown,
            ctx: GraphQLContext
        ) => {
            return ctx.db.query.users.findFirst({
                where: eq(schema.users.id, pr.authorId),
            });
        },

        headRefName: (pr: typeof schema.pullRequests.$inferSelect) => pr.headBranch,
        headRefOid: (pr: typeof schema.pullRequests.$inferSelect) => pr.headSha,
        baseRefName: (pr: typeof schema.pullRequests.$inferSelect) => pr.baseBranch,
        baseRefOid: (pr: typeof schema.pullRequests.$inferSelect) => pr.baseSha,

        merged: (pr: typeof schema.pullRequests.$inferSelect) => pr.isMerged || false,

        mergeable: (pr: typeof schema.pullRequests.$inferSelect) => {
            if (pr.mergeable === true) return "MERGEABLE";
            if (pr.mergeable === false) return "CONFLICTING";
            return "UNKNOWN";
        },

        mergedBy: async (
            pr: typeof schema.pullRequests.$inferSelect,
            _: unknown,
            ctx: GraphQLContext
        ) => {
            if (!pr.mergedById) return null;
            return ctx.db.query.users.findFirst({
                where: eq(schema.users.id, pr.mergedById),
            });
        },

        reviews: async (
            pr: typeof schema.pullRequests.$inferSelect,
            { first = 10 }: { first: number },
            ctx: GraphQLContext
        ) => {
            const reviews = await ctx.db.query.pullRequestReviews.findMany({
                where: eq(schema.pullRequestReviews.pullRequestId, pr.id),
                limit: first + 1,
            });
            const nodes = reviews.slice(0, first);
            return {
                nodes,
                pageInfo: createPageInfo(nodes, first, null, reviews.length),
                totalCount: nodes.length,
            };
        },

        comments: async (
            pr: typeof schema.pullRequests.$inferSelect,
            { first = 10 }: { first: number },
            ctx: GraphQLContext
        ) => {
            const comments = await ctx.db.query.pullRequestComments.findMany({
                where: eq(schema.pullRequestComments.pullRequestId, pr.id),
                limit: first + 1,
            });
            const nodes = comments.slice(0, first);
            return {
                nodes,
                pageInfo: createPageInfo(nodes, first, null, comments.length),
                totalCount: nodes.length,
            };
        },

        files: () => ({ nodes: [], pageInfo: { hasNextPage: false, hasPreviousPage: false }, totalCount: 0 }),
        commits: () => ({ nodes: [], pageInfo: { hasNextPage: false, hasPreviousPage: false }, totalCount: 0 }),
        reviewRequests: () => ({ nodes: [], pageInfo: { hasNextPage: false, hasPreviousPage: false }, totalCount: 0 }),
        assignees: () => ({ nodes: [], pageInfo: { hasNextPage: false, hasPreviousPage: false }, totalCount: 0 }),
        labels: () => ({ nodes: [], pageInfo: { hasNextPage: false, hasPreviousPage: false }, totalCount: 0 }),
    },

    PullRequestReview: {
        author: async (
            review: typeof schema.pullRequestReviews.$inferSelect,
            _: unknown,
            ctx: GraphQLContext
        ) => {
            return ctx.db.query.users.findFirst({
                where: eq(schema.users.id, review.reviewerId),
            });
        },

        state: (review: typeof schema.pullRequestReviews.$inferSelect) =>
            review.state.toUpperCase(),

        comments: () => ({
            nodes: [],
            pageInfo: { hasNextPage: false, hasPreviousPage: false },
            totalCount: 0,
        }),
    },

    Comment: {
        author: async (
            comment: typeof schema.pullRequestComments.$inferSelect,
            _: unknown,
            ctx: GraphQLContext
        ) => {
            return ctx.db.query.users.findFirst({
                where: eq(schema.users.id, comment.authorId),
            });
        },

        suggestion: (comment: typeof schema.pullRequestComments.$inferSelect) =>
            comment.suggestionContent,
    },

    Issue: {
        author: async (
            issue: typeof schema.issues.$inferSelect,
            _: unknown,
            ctx: GraphQLContext
        ) => {
            return ctx.db.query.users.findFirst({
                where: eq(schema.users.id, issue.authorId),
            });
        },

        state: (issue: typeof schema.issues.$inferSelect) => issue.state.toUpperCase(),

        // ── WS5-02: real nested data for Issue ──────────────────────────
        comments: async (issue: typeof schema.issues.$inferSelect, _: unknown, ctx: GraphQLContext) => {
            const rows = await ctx.db.query.issueComments.findMany({
                where: eq(schema.issueComments.issueId, issue.id),
            });
            return {
                nodes: rows,
                pageInfo: { hasNextPage: false, hasPreviousPage: false },
                totalCount: rows.length,
            };
        },
        assignees: async (issue: typeof schema.issues.$inferSelect, _: unknown, ctx: GraphQLContext) => {
            const rows = await ctx.db.query.issueAssignees.findMany({
                where: eq(schema.issueAssignees.issueId, issue.id),
                with: { user: true },
            });
            return {
                nodes: rows.map((r) => r.user),
                pageInfo: { hasNextPage: false, hasPreviousPage: false },
                totalCount: rows.length,
            };
        },
        labels: async (issue: typeof schema.issues.$inferSelect, _: unknown, ctx: GraphQLContext) => {
            const rows = await ctx.db.query.issueLabels.findMany({
                where: eq(schema.issueLabels.issueId, issue.id),
                with: { label: true },
            });
            return {
                nodes: rows.map((r) => r.label),
                pageInfo: { hasNextPage: false, hasPreviousPage: false },
                totalCount: rows.length,
            };
        },
        milestone: async (issue: typeof schema.issues.$inferSelect, _: unknown, ctx: GraphQLContext) => {
            if (!issue.milestoneId) return null;
            return ctx.db.query.milestones.findFirst({
                where: eq(schema.milestones.id, issue.milestoneId),
            });
        },
    },

    SearchResultItem: {
        __resolveType(obj: any) {
            if (obj.headBranch) return "PullRequest";
            if (obj.repositoryId && obj.number) return "Issue";
            if (obj.diskPath) return "Repository";
            return "User";
        },
    },

    AddLabelsSubject: {
        __resolveType(obj: any) {
            if (obj.headBranch) return "PullRequest";
            return "Issue";
        },
    },

    Mutation: {
        createRepository: async (
            _: unknown,
            { input }: { input: any },
            ctx: GraphQLContext
        ) => {
            if (!ctx.userId) throw new Error("Authentication required");

            const { generateId } = await import("@/lib/utils");
            const id = generateId();

            const slug = input.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

            await ctx.db.insert(schema.repositories).values({
                id,
                name: input.name,
                slug,
                description: input.description,
                ownerId: ctx.userId,
                visibility: input.visibility?.toLowerCase() || "public",
                diskPath: `repos/${ctx.userId}/${input.name}.git`,
                defaultBranch: "main",
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const repo = await ctx.db.query.repositories.findFirst({
                where: eq(schema.repositories.id, id),
            });

            return { repository: repo };
        },

        createPullRequest: async (
            _: unknown,
            { input }: { input: any },
            ctx: GraphQLContext
        ) => {
            if (!ctx.userId) throw new Error("Authentication required");

            const { generateId } = await import("@/lib/utils");

            // Verify repository exists
            const repo = await ctx.db.query.repositories.findFirst({
                where: eq(schema.repositories.id, input.repositoryId),
            });
            if (!repo) throw new Error("Repository not found");

            const repoPath = await resolveRepoPath(repo.diskPath);
            const headCommit = await getCommit(repoPath, input.headRefName);
            if (!headCommit) throw new Error(`Head branch ${input.headRefName} not found`);

            const baseCommit = await getCommit(repoPath, input.baseRefName);
            if (!baseCommit) throw new Error(`Base branch ${input.baseRefName} not found`);

            const { diffs } = await compareBranches(repoPath, input.baseRefName, input.headRefName);
            const additions = diffs.reduce((sum, diff) => sum + diff.additions, 0);
            const deletions = diffs.reduce((sum, diff) => sum + diff.deletions, 0);
            const changedFiles = diffs.length;

            // Get next PR number
            const result = await ctx.db
                .select({ count: count() })
                .from(schema.pullRequests)
                .where(eq(schema.pullRequests.repositoryId, input.repositoryId));
            const number = (result[0]?.count || 0) + 1;

            const id = generateId();

            await ctx.db.insert(schema.pullRequests).values({
                id,
                repositoryId: input.repositoryId,
                number,
                title: input.title,
                body: input.body,
                authorId: ctx.userId,
                headBranch: input.headRefName,
                baseBranch: input.baseRefName,
                headSha: headCommit.sha,
                baseSha: baseCommit.sha,
                isDraft: input.draft,
                state: "open",
                additions,
                deletions,
                changedFiles,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const pr = await ctx.db.query.pullRequests.findFirst({
                where: eq(schema.pullRequests.id, id),
            });

            return { pullRequest: pr };
        },

        mergePullRequest: async (
            _: unknown,
            { input }: { input: any },
            ctx: GraphQLContext
        ) => {
            if (!ctx.userId) throw new Error("Authentication required");

            const pr = await ctx.db.query.pullRequests.findFirst({
                where: eq(schema.pullRequests.id, input.pullRequestId),
            });
            if (!pr) throw new Error("Pull request not found");

            if (pr.state !== "open") throw new Error("Pull request is not open");

            const repo = await ctx.db.query.repositories.findFirst({
                where: eq(schema.repositories.id, pr.repositoryId),
            });
            if (!repo) throw new Error("Repository not found");

            if (!(await canWriteRepo(ctx.userId, repo, { isAdmin: ctx.user?.isAdmin ?? undefined }))) {
                throw new Error("Access denied");
            }

            const gateResult = await evaluateGates(pr.id);
            if (!gateResult.canMerge) {
                const failed = gateResult.results
                    .filter((r) => !r.passed)
                    .map((r) => r.message)
                    .join("; ");
                throw new Error(`Merge blocked: ${failed}`);
            }

            const commitTitle = input.commitTitle || `Merge pull request #${pr.number} from ${pr.headBranch}`;
            const mergeMessage = input.commitBody
                ? `${commitTitle}\n\n${input.commitBody}`
                : commitTitle;

            const repoPath = await resolveRepoPath(repo.diskPath);
            const mergeResult = await mergeBranch(repoPath, pr.baseBranch, pr.headBranch, mergeMessage);
            if (!mergeResult.success) {
                throw new Error(mergeResult.message || "Merge failed");
            }

            const now = new Date();
            await ctx.db.update(schema.pullRequests)
                .set({
                    state: "merged",
                    isMerged: true,
                    mergedAt: now,
                    mergedById: ctx.userId,
                    mergeCommitSha: mergeResult.sha || null,
                    mergeSha: mergeResult.sha || null,
                    mergeMethod: input.mergeMethod?.toLowerCase() || "merge",
                    updatedAt: now,
                })
                .where(eq(schema.pullRequests.id, input.pullRequestId));

            await closeLinkedIssuesOnMerge(pr.id, ctx.userId);

            const updatedPr = await ctx.db.query.pullRequests.findFirst({
                where: eq(schema.pullRequests.id, input.pullRequestId),
            });

            return { pullRequest: updatedPr };
        },

        addPullRequestReview: async (
            _: unknown,
            { input }: { input: any },
            ctx: GraphQLContext
        ) => {
            if (!ctx.userId) throw new Error("Authentication required");

            const { generateId } = await import("@/lib/utils");
            const { checkPathPermissions } = await import("@/lib/path-scoping");

            const pullRequest = await ctx.db.query.pullRequests.findFirst({
                where: eq(schema.pullRequests.id, input.pullRequestId),
                columns: {
                    id: true,
                    repositoryId: true,
                },
            });
            if (!pullRequest) throw new Error("Pull request not found");

            const repository = await ctx.db.query.repositories.findFirst({
                where: eq(schema.repositories.id, pullRequest.repositoryId),
            });
            if (!repository || !(await canWriteRepo(ctx.userId, repository, { isAdmin: ctx.user?.isAdmin ?? undefined }))) {
                throw new Error("Insufficient repository permissions");
            }

            const scopedPaths = [...new Set(
                (input.comments || [])
                    .map((comment: { path?: string }) => comment.path)
                    .filter(Boolean) as string[]
            )];
            if (scopedPaths.length > 0) {
                const permission = await checkPathPermissions(
                    ctx.userId,
                    repository.id,
                    scopedPaths,
                    "write"
                );
                if (!permission.allowed) {
                    throw new Error(permission.reason || "Insufficient path permissions");
                }
            }

            const reviewStateByEvent: Record<string, "commented" | "approved" | "changes_requested"> = {
                COMMENT: "commented",
                APPROVE: "approved",
                REQUEST_CHANGES: "changes_requested",
            };
            const mappedState = reviewStateByEvent[input.event];
            if (!mappedState) {
                throw new Error("Invalid review event");
            }

            const reviewId = generateId();

            await ctx.db.insert(schema.pullRequestReviews).values({
                id: reviewId,
                pullRequestId: pullRequest.id,
                reviewerId: ctx.userId,
                state: mappedState,
                body: input.body,
                submittedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Handle comments if present
            if (input.comments && input.comments.length > 0) {
                for (const comment of input.comments) {
                    await ctx.db.insert(schema.pullRequestComments).values({
                        id: generateId(),
                        pullRequestId: pullRequest.id,
                        reviewId: reviewId,
                        authorId: ctx.userId,
                        body: comment.body,
                        path: comment.path,
                        line: comment.line,
                        suggestionContent: comment.suggestion,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                }
            }

            const review = await ctx.db.query.pullRequestReviews.findFirst({
                where: eq(schema.pullRequestReviews.id, reviewId),
            });

            return { pullRequestReview: review };
        },

        addComment: async (
            _: unknown,
            { input }: { input: any },
            ctx: GraphQLContext
        ) => {
            if (!ctx.userId) throw new Error("Authentication required");

            const { generateId } = await import("@/lib/utils");
            const id = generateId();

            // Try to find as Issue first
            const issue = await ctx.db.query.issues.findFirst({
                where: eq(schema.issues.id, input.subjectId),
            });

            if (issue) {
                const repository = await ctx.db.query.repositories.findFirst({
                    where: eq(schema.repositories.id, issue.repositoryId),
                });
                if (!repository || !(await canWriteRepo(ctx.userId, repository, { isAdmin: ctx.user?.isAdmin ?? undefined }))) {
                    throw new Error("Insufficient repository permissions");
                }

                await ctx.db.insert(schema.issueComments).values({
                    id,
                    issueId: input.subjectId,
                    authorId: ctx.userId,
                    body: input.body,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

                const comment = await ctx.db.query.issueComments.findFirst({
                    where: eq(schema.issueComments.id, id),
                });

                return { comment };
            }

            // Try to find as Pull Request
            const pr = await ctx.db.query.pullRequests.findFirst({
                where: eq(schema.pullRequests.id, input.subjectId),
            });

            if (pr) {
                const repository = await ctx.db.query.repositories.findFirst({
                    where: eq(schema.repositories.id, pr.repositoryId),
                });
                if (!repository || !(await canWriteRepo(ctx.userId, repository, { isAdmin: ctx.user?.isAdmin ?? undefined }))) {
                    throw new Error("Insufficient repository permissions");
                }

                await ctx.db.insert(schema.pullRequestComments).values({
                    id,
                    pullRequestId: input.subjectId,
                    authorId: ctx.userId,
                    body: input.body,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

                const comment = await ctx.db.query.pullRequestComments.findFirst({
                    where: eq(schema.pullRequestComments.id, id),
                });

                return { comment };
            }

            throw new Error("Subject not found (must be Issue ID or Pull Request ID)");
        },

        // ── WS5-02: createIssue ─────────────────────────────────────────
        createIssue: async (
            _: unknown,
            { input }: { input: any },
            ctx: GraphQLContext
        ) => {
            if (!ctx.userId) throw new Error("Authentication required");
            const { generateId } = await import("@/lib/utils");

            const repository = await ctx.db.query.repositories.findFirst({
                where: eq(schema.repositories.id, input.repositoryId),
            });
            if (!repository) throw new Error("Repository not found");
            if (!(await canWriteRepo(ctx.userId, repository, { isAdmin: ctx.user?.isAdmin ?? undefined }))) {
                throw new Error("Insufficient repository permissions");
            }

            const lastIssue = await ctx.db.query.issues.findFirst({
                where: eq(schema.issues.repositoryId, repository.id),
                orderBy: (issues, { desc }) => [desc(issues.number)],
            });
            const number = (lastIssue?.number || 0) + 1;
            const id = generateId("issue");

            await ctx.db.insert(schema.issues).values({
                id,
                repositoryId: repository.id,
                number,
                title: input.title,
                body: input.body || null,
                state: "open",
                type: "issue",
                authorId: ctx.userId,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            if (Array.isArray(input.labelIds) && input.labelIds.length > 0) {
                await ctx.db.insert(schema.issueLabels).values(
                    input.labelIds.map((labelId: string) => ({
                        id: generateId(),
                        issueId: id,
                        labelId,
                    })),
                );
            }
            if (Array.isArray(input.assigneeIds) && input.assigneeIds.length > 0) {
                await ctx.db.insert(schema.issueAssignees).values(
                    input.assigneeIds.map((userId: string) => ({
                        id: generateId(),
                        issueId: id,
                        userId,
                        assignedAt: new Date(),
                    })),
                );
            }
            if (input.milestoneId) {
                const milestone = await ctx.db.query.milestones.findFirst({
                    where: eq(schema.milestones.id, input.milestoneId),
                });
                if (milestone && milestone.repositoryId === repository.id) {
                    await ctx.db.update(schema.issues).set({ milestoneId: milestone.id }).where(eq(schema.issues.id, id));
                }
            }

            const issue = await ctx.db.query.issues.findFirst({ where: eq(schema.issues.id, id) });
            return { issue };
        },

        // ── WS5-02: updateIssue ─────────────────────────────────────────
        updateIssue: async (
            _: unknown,
            { input }: { input: any },
            ctx: GraphQLContext
        ) => {
            if (!ctx.userId) throw new Error("Authentication required");

            const issue = await ctx.db.query.issues.findFirst({
                where: eq(schema.issues.id, input.issueId),
            });
            if (!issue) throw new Error("Issue not found");

            const repository = await ctx.db.query.repositories.findFirst({
                where: eq(schema.repositories.id, issue.repositoryId),
            });
            if (!repository || !(await canWriteRepo(ctx.userId, repository, { isAdmin: ctx.user?.isAdmin ?? undefined }))) {
                throw new Error("Insufficient repository permissions");
            }

            const updates: any = { updatedAt: new Date() };
            if (input.title !== undefined) updates.title = input.title;
            if (input.body !== undefined) updates.body = input.body;
            if (input.state !== undefined) {
                const closed = String(input.state).toLowerCase() === "closed";
                updates.state = closed ? "closed" : "open";
                updates.closedAt = closed ? new Date() : null;
                updates.closedById = closed ? ctx.userId : null;
            }
            if (input.milestoneId !== undefined) updates.milestoneId = input.milestoneId || null;

            await ctx.db.update(schema.issues).set(updates).where(eq(schema.issues.id, issue.id));

            const updated = await ctx.db.query.issues.findFirst({ where: eq(schema.issues.id, issue.id) });
            return { issue: updated };
        },

        // ── WS5-02: updatePullRequest (title/body/draft) ────────────────
        updatePullRequest: async (
            _: unknown,
            { input }: { input: any },
            ctx: GraphQLContext
        ) => {
            if (!ctx.userId) throw new Error("Authentication required");

            const pr = await ctx.db.query.pullRequests.findFirst({
                where: eq(schema.pullRequests.id, input.pullRequestId),
            });
            if (!pr) throw new Error("Pull request not found");

            const repository = await ctx.db.query.repositories.findFirst({
                where: eq(schema.repositories.id, pr.repositoryId),
            });
            if (!repository || !(await canWriteRepo(ctx.userId, repository, { isAdmin: ctx.user?.isAdmin ?? undefined }))) {
                throw new Error("Insufficient repository permissions");
            }

            const updates: any = { updatedAt: new Date() };
            if (input.title !== undefined) updates.title = input.title;
            if (input.body !== undefined) updates.body = input.body;
            if (input.draft !== undefined) updates.isDraft = input.draft === true;

            await ctx.db.update(schema.pullRequests).set(updates).where(eq(schema.pullRequests.id, pr.id));

            const updated = await ctx.db.query.pullRequests.findFirst({ where: eq(schema.pullRequests.id, pr.id) });
            return { pullRequest: updated };
        },

        // ── WS5-02: addLabels (issue or PR) ─────────────────────────────
        addLabels: async (
            _: unknown,
            { input }: { input: any },
            ctx: GraphQLContext
        ) => {
            if (!ctx.userId) throw new Error("Authentication required");
            const { generateId } = await import("@/lib/utils");

            const [issue, pr] = await Promise.all([
                ctx.db.query.issues.findFirst({ where: eq(schema.issues.id, input.subjectId) }),
                ctx.db.query.pullRequests.findFirst({ where: eq(schema.pullRequests.id, input.subjectId) }),
            ]);
            if (!issue && !pr) throw new Error("Subject not found");

            const repositoryId = issue?.repositoryId || pr?.repositoryId;
            if (!repositoryId) throw new Error("Subject not found");
            const repository = await ctx.db.query.repositories.findFirst({
                where: eq(schema.repositories.id, repositoryId),
            });
            if (!repository || !(await canWriteRepo(ctx.userId, repository, { isAdmin: ctx.user?.isAdmin ?? undefined }))) {
                throw new Error("Insufficient repository permissions");
            }

            const labelIds = input.labelIds as string[];
            if (issue) {
                const existing = await ctx.db.query.issueLabels.findMany({
                    where: (t, { and: andFn, eq: eqFn, inArray: inArr }) =>
                        andFn(eqFn(t.issueId, issue.id), inArr(t.labelId, labelIds)),
                    columns: { labelId: true },
                });
                const existingIds = new Set(existing.map((e) => e.labelId));
                const toAdd = labelIds.filter((id) => !existingIds.has(id));
                if (toAdd.length > 0) {
                    await ctx.db.insert(schema.issueLabels).values(
                        toAdd.map((labelId) => ({ id: generateId(), issueId: issue.id, labelId })),
                    );
                }
                const updated = await ctx.db.query.issues.findFirst({
                    where: eq(schema.issues.id, issue.id),
                    with: { labels: { with: { label: true } } },
                });
                return { subject: updated };
            }

            const existing = await ctx.db.query.pullRequestLabels.findMany({
                where: (t, { and: andFn, eq: eqFn, inArray: inArr }) =>
                    andFn(eqFn(t.pullRequestId, pr!.id), inArr(t.labelId, labelIds)),
                columns: { labelId: true },
            });
            const existingIds = new Set(existing.map((e) => e.labelId));
            const toAdd = labelIds.filter((id) => !existingIds.has(id));
            if (toAdd.length > 0) {
                await ctx.db.insert(schema.pullRequestLabels).values(
                    toAdd.map((labelId) => ({ id: generateId(), pullRequestId: pr!.id, labelId })),
                );
            }
            const updated = await ctx.db.query.pullRequests.findFirst({
                where: eq(schema.pullRequests.id, pr!.id),
                with: { labels: { with: { label: true } } },
            });
            return { subject: updated };
        },

        applySuggestion: async (
            _: unknown,
            { input }: { input: any },
            ctx: GraphQLContext
        ) => {
            if (!ctx.userId) throw new Error("Authentication required");

            const comment = await ctx.db.query.pullRequestComments.findFirst({
                where: eq(schema.pullRequestComments.id, input.commentId),
                with: {
                    pullRequest: {
                        columns: {
                            id: true,
                            repositoryId: true,
                        },
                    },
                },
            });
            if (!comment || !comment.pullRequest) {
                throw new Error("Comment not found");
            }

            const { canApplySuggestions, applySuggestion } = await import("@/lib/suggestions");
            const canApply = await canApplySuggestions(ctx.userId, comment.pullRequest.id);
            if (!canApply) {
                throw new Error("You don't have permission to apply suggestions");
            }

            if (comment.path) {
                const { checkPathPermissions } = await import("@/lib/path-scoping");
                const permission = await checkPathPermissions(
                    ctx.userId,
                    comment.pullRequest.repositoryId,
                    [comment.path],
                    "write"
                );
                if (!permission.allowed) {
                    throw new Error(permission.reason || "Insufficient path permissions");
                }
            }

            const result = await applySuggestion(input.commentId, ctx.userId);

            if (!result.success) {
                throw new Error(result.error || "Failed to apply suggestion");
            }

            const updatedComment = await ctx.db.query.pullRequestComments.findFirst({
                where: eq(schema.pullRequestComments.id, input.commentId),
            });

            return { success: true, comment: updatedComment };
        },

        batchApplySuggestions: async (
            _: unknown,
            { input }: { input: any },
            ctx: GraphQLContext
        ) => {
            if (!ctx.userId) throw new Error("Authentication required");

            const comments = await ctx.db.query.pullRequestComments.findMany({
                where: inArray(schema.pullRequestComments.id, input.commentIds),
                with: {
                    pullRequest: {
                        columns: {
                            id: true,
                            repositoryId: true,
                        },
                    },
                },
            });
            if (comments.length !== input.commentIds.length) {
                throw new Error("One or more comments were not found");
            }

            const prIds = new Set(comments.map(c => c.pullRequest?.id).filter(Boolean));
            if (prIds.size !== 1) {
                throw new Error("All suggestions in a batch must belong to the same pull request");
            }

            const [pullRequestId] = [...prIds] as string[];
            const repositoryId = comments[0].pullRequest?.repositoryId;
            if (!repositoryId) {
                throw new Error("Repository not found for suggestions");
            }

            const { canApplySuggestions, batchApplySuggestions } = await import("@/lib/suggestions");
            const canApply = await canApplySuggestions(ctx.userId, pullRequestId);
            if (!canApply) {
                throw new Error("You don't have permission to apply suggestions");
            }

            const scopedPaths = [...new Set(comments.map(c => c.path).filter(Boolean) as string[])];
            if (scopedPaths.length > 0) {
                const { checkPathPermissions } = await import("@/lib/path-scoping");
                const permission = await checkPathPermissions(
                    ctx.userId,
                    repositoryId,
                    scopedPaths,
                    "write"
                );
                if (!permission.allowed) {
                    throw new Error(permission.reason || "Insufficient path permissions");
                }
            }

            const result = await batchApplySuggestions(input.commentIds, ctx.userId);

            const appliedComments = await ctx.db.query.pullRequestComments.findMany({
                where: (comments, { inArray }) => inArray(comments.id, result.applied),
            });

            return {
                appliedSuggestions: appliedComments,
                failedSuggestions: result.failed.map(f => ({
                    commentId: f.id,
                    error: f.error
                }))
            };
        },
    },
};
