
import { getDatabase } from "../db";
import { type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { eq, and, exists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
    pullRequests,
    pullRequestReviewers,
    pullRequestAssignees,
    pullRequestReviews,
} from "../db/schema/pull-requests";
import { repositories } from "../db/schema/repositories";
import { users } from "../db/schema/users";

// Force cast to avoid union type issues in this file
const db = getDatabase() as NodePgDatabase<typeof schema>;

export type InboxItem = {
    id: string;
    number: number;
    title: string;
    repository: {
        owner: string;
        name: string;
    };
    author: {
        username: string;
        avatarUrl: string | null;
    };
    updatedAt: Date;
    type: "review_required" | "changes_requested" | "assigned";
};

export async function getInboxItems(userId: string): Promise<InboxItem[]> {
    const items: InboxItem[] = [];

    // Alias for repo owner to distinguish from PR author
    const repoOwners = alias(users, "repo_owners");

    // 1. Review Required
    const reviewsRequired = await db
        .select({
            pr: pullRequests,
            repo: repositories,
            author: users,
            owner: repoOwners
        })
        .from(pullRequests)
        .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
        .innerJoin(users, eq(pullRequests.authorId, users.id))
        .innerJoin(repoOwners, eq(repositories.ownerId, repoOwners.id))
        .innerJoin(
            pullRequestReviewers,
            eq(pullRequests.id, pullRequestReviewers.pullRequestId)
        )
        .where(
            and(
                eq(pullRequestReviewers.userId, userId),
                eq(pullRequests.state, "open")
            )
        );

    reviewsRequired.forEach(({ pr, repo, author, owner }) => {
        items.push({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            repository: { owner: owner.username, name: repo.name },
            author: { username: author.username, avatarUrl: author.avatarUrl },
            updatedAt: pr.updatedAt,
            type: "review_required",
        });
    });

    // 2. Changes Requested
    const changesRequested = await db
        .select({
            pr: pullRequests,
            repo: repositories,
            author: users,
            owner: repoOwners
        })
        .from(pullRequests)
        .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
        .innerJoin(users, eq(pullRequests.authorId, users.id))
        .innerJoin(repoOwners, eq(repositories.ownerId, repoOwners.id))
        .where(
            and(
                eq(pullRequests.authorId, userId),
                eq(pullRequests.state, "open"),
                exists(
                    db
                        .select()
                        .from(pullRequestReviews)
                        .where(
                            and(
                                eq(pullRequestReviews.pullRequestId, pullRequests.id),
                                eq(pullRequestReviews.state, "changes_requested")
                            )
                        )
                )
            )
        );

    changesRequested.forEach(({ pr, repo, author, owner }) => {
        items.push({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            repository: { owner: owner.username, name: repo.name },
            author: { username: author.username, avatarUrl: author.avatarUrl },
            updatedAt: pr.updatedAt,
            type: "changes_requested",
        });
    });

    // 3. Assigned
    const assigned = await db
        .select({
            pr: pullRequests,
            repo: repositories,
            author: users,
            owner: repoOwners
        })
        .from(pullRequests)
        .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
        .innerJoin(users, eq(pullRequests.authorId, users.id))
        .innerJoin(repoOwners, eq(repositories.ownerId, repoOwners.id))
        .innerJoin(
            pullRequestAssignees,
            eq(pullRequests.id, pullRequestAssignees.pullRequestId)
        )
        .where(
            and(
                eq(pullRequestAssignees.userId, userId),
                eq(pullRequests.state, "open")
            )
        );

    assigned.forEach(({ pr, repo, author, owner }) => {
        if (!items.find((i) => i.id === pr.id)) {
            items.push({
                id: pr.id,
                number: pr.number,
                title: pr.title,
                repository: { owner: owner.username, name: repo.name },
                author: { username: author.username, avatarUrl: author.avatarUrl },
                updatedAt: pr.updatedAt,
                type: "assigned",
            });
        }
    });

    return items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
