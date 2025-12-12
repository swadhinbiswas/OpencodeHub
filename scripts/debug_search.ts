
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../src/db/schema';
import { like, or } from 'drizzle-orm';

const sqlite = new Database('./data/opencodehub.db');
const db = drizzle(sqlite, { schema });

async function run() {
    console.log('Running search debug...');
    const query = 'swadhin';

    console.log(`Query: "${query}"`);

    // Search Users
    const users = await db.query.users.findMany({
        where: or(
            like(schema.users.username, `%${query}%`),
            like(schema.users.displayName, `%${query}%`)
        ),
        limit: 3
    });
    console.log('Users found:', users.length);
    users.forEach(u => console.log(` - ${u.username} (${u.displayName})`));

    // Search Repos
    const repos = await db.query.repositories.findMany({
        where: or(
            like(schema.repositories.name, `%${query}%`),
            like(schema.repositories.description, `%${query}%`)
        ),
        with: { owner: true },
        limit: 5
    });
    console.log('Repos found:', repos.length);
    repos.forEach(r => console.log(` - ${r.namespace}/${r.name}`));

    if (users.length === 0 && repos.length === 0) {
        console.log('WARNING: No results found in DB!');
    } else {
        console.log('SUCCESS: DB returns results.');
    }
}

run().catch(console.error);
