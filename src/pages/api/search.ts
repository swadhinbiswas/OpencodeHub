
import type { APIRoute } from 'astro';
import { getDatabase, schema } from '@/db';
import { ilike, or, and, eq, desc } from 'drizzle-orm';
import { success, serverError } from '@/lib/api';

export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const query = url.searchParams.get('q');

        if (!query || query.length < 2) {
            return success({ results: [] });
        }

        const db = getDatabase();

        // Search Repositories
        const repos = await db.query.repositories.findMany({
            where: or(
                ilike(schema.repositories.name, `%${query}%`),
                ilike(schema.repositories.description, `%${query}%`)
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
                ilike(schema.users.username, `%${query}%`),
                ilike(schema.users.displayName, `%${query}%`)
            ),
            limit: 3
        });

        // Format Results
        const results = [
            ...repos.map(repo => ({
                type: 'repository',
                title: `${repo.owner.username}/${repo.name}`, // "owner/repo"
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
            }))
        ];

        return success({ results });

    } catch (error) {
        console.error('Search error:', error);
        return serverError('Search failed');
    }
};
