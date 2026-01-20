import type { APIRoute } from 'astro';
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from '@/db';
import { like, or, eq, desc } from 'drizzle-orm';
import { success, serverError } from '@/lib/api';
import { withErrorHandler } from "@/lib/errors";

export const GET: APIRoute = withErrorHandler(async ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');

    if (!query || query.length < 2) {
        return success({ results: [] });
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Search Repositories
    const repos = await db.query.repositories.findMany({
        where: or(
            like(schema.repositories.name, `%${query}%`),
            like(schema.repositories.description, `%${query}%`)
        ),
        with: {
            owner: true
        },
        limit: 5,
        orderBy: [desc(schema.repositories.starCount)]
    });

    // Search Users
    const users = await db.query.users.findMany({
        where: or(
            like(schema.users.username, `%${query}%`),
            like(schema.users.displayName, `%${query}%`)
        ),
        limit: 3
    });

    // Search Issues
    const issues = await db.query.issues.findMany({
        where: or(
            like(schema.issues.title, `%${query}%`),
            like(schema.issues.body, `%${query}%`)
        ),
        with: {
            repository: {
                with: {
                    owner: true
                }
            }
        },
        limit: 5
    });

    // Search Pull Requests
    const prs = await db.query.pullRequests.findMany({
        where: or(
            like(schema.pullRequests.title, `%${query}%`),
            like(schema.pullRequests.body, `%${query}%`)
        ),
        with: {
            repository: {
                with: {
                    owner: true
                }
            }
        },
        limit: 5
    });

    // Search Workflows
    const workflows = await db.query.workflows.findMany({
        where: like(schema.workflows.name, `%${query}%`),
        with: {
            repository: {
                with: {
                    owner: true
                }
            }
        },
        limit: 5
    });

    // Format Results
    const results = [
        ...repos.map(repo => ({
            type: 'repository',
            title: `${repo.owner.username}/${repo.name}`,
            subtitle: repo.description,
            url: `/${repo.owner.username}/${repo.name}`,
            icon: 'repo'
        })),
        ...users.map(user => ({
            type: 'user',
            title: user.displayName || user.username,
            subtitle: `@${user.username}`,
            url: `/${user.username}`,
            icon: 'user'
        })),
        ...issues.map((issue: any) => ({
            type: 'issue',
            title: issue.title,
            subtitle: `${issue.repository.owner.username}/${issue.repository.name} #${issue.number}`,
            url: `/${issue.repository.owner.username}/${issue.repository.name}/issues/${issue.number}`,
            icon: 'issue'
        })),
        ...prs.map((pr: any) => ({
            type: 'pr',
            title: pr.title,
            subtitle: `${pr.repository.owner.username}/${pr.repository.name} #${pr.number}`,
            url: `/${pr.repository.owner.username}/${pr.repository.name}/pulls/${pr.number}`,
            icon: 'pr'
        })),
        ...workflows.map((wf: any) => ({
            type: 'workflow',
            title: wf.name,
            subtitle: `${wf.repository.owner.username}/${wf.repository.name}`,
            url: `/${wf.repository.owner.username}/${wf.repository.name}/actions`, // Link to actions tab
            icon: 'workflow'
        }))
    ];

    return success({ results });
});
