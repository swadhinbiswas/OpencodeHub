
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { faker } from "@faker-js/faker";

// Create a Bun-native DB connection for seeding
const sqlite = new Database("data/opencodehub.db");
const db = drizzle(sqlite, { schema });

async function seed() {
    console.log("🌱 Seeding fancy admin demo data (Bun Edition)...");

    // 1. Create Users
    const users = [];
    for (let i = 0; i < 20; i++) {
        const id = faker.string.uuid();
        const user = {
            id,
            username: faker.internet.username(),
            email: faker.internet.email(),
            display_name: faker.person.fullName(), // Note: verify schema column name
            avatar_url: faker.image.avatar(),
            created_at: faker.date.past().toISOString(),
            updated_at: new Date().toISOString(),
            role: 'user'
        };

        // Auto-fix potential camelCase vs snake_case issues by checking schema
        // But since I import * as schema, I'll rely on Drizzle's inference if I use the objects.
        // Actually, values() expects keys matching the table definition. Drizzle usually maps camelCase to snake_case in column definitions.
        // Let's assume the previous camelCase object was correct because Drizzle handles mapping.
        // Rewriting user object to match TS types:
        const userObj = {
            id,
            username: user.username,
            email: user.email,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            role: 'user'
        };

        try {
            await db.insert(schema.users).values(userObj);
            users.push(userObj);
        } catch (e) {
            // Ignore constraints
        }
    }
    console.log(`✅ Created ${users.length} users`);

    if (users.length === 0) {
        const existing = await db.select().from(schema.users).limit(10);
        users.push(...existing);
    }

    // 2. Create Repositories
    const repos = [];
    for (let i = 0; i < 50; i++) {
        const owner = users[Math.floor(Math.random() * users.length)];
        if (!owner) continue;

        const id = faker.string.uuid();

        // Generate random languages stats
        const repoLangs = {};
        const langCount = Math.floor(Math.random() * 4) + 1;
        let totalPerc = 100;
        for (let j = 0; j < langCount; j++) {
            const lang = ["TypeScript", "Rust", "Go", "Python", "JavaScript", "C++", "HTML", "CSS"][Math.floor(Math.random() * 8)];
            const perc = j === langCount - 1 ? totalPerc : Math.floor(Math.random() * totalPerc);
            repoLangs[lang] = (repoLangs[lang] || 0) + perc;
            totalPerc -= perc;
        }

        const repo = {
            id,
            name: faker.word.sample() + "-" + faker.word.noun(),
            slug: faker.helpers.slugify(faker.word.sample() + "-" + faker.word.noun()).toLowerCase(),
            description: faker.company.catchPhrase(),
            ownerId: owner.id,
            visibility: Math.random() > 0.1 ? 'public' : 'private',
            defaultBranch: 'main',
            diskPath: `/var/opt/opencodehub/repos/${owner.username}/${faker.word.sample()}`,
            languages: JSON.stringify(repoLangs),
            createdAt: faker.date.past().toISOString(),
            updatedAt: faker.date.recent().toISOString()
        };

        try {
            await db.insert(schema.repositories).values(repo);
            repos.push(repo);
        } catch (e) { console.error("Repo error:", e); }
    }
    console.log(`✅ Created ${repos.length} repositories`);

    // 3. Create Commits (For Code Stats)
    // Ensure we have 'commits' in schema export
    for (let i = 0; i < 500; i++) {
        const repo = repos[Math.floor(Math.random() * repos.length)];
        const user = users[Math.floor(Math.random() * users.length)];
        if (!repo || !user) continue;

        const stats = {
            additions: Math.floor(Math.random() * 500),
            deletions: Math.floor(Math.random() * 200),
            files_changed: Math.floor(Math.random() * 10) + 1
        };

        try {
            await db.insert(schema.commits).values({
                id: faker.string.uuid(),
                repositoryId: repo.id,
                sha: faker.git.commitSha(),
                message: faker.git.commitMessage(),
                authorName: user.displayName || user.username,
                authorEmail: user.email,
                authorDate: faker.date.recent({ days: 60 }).toISOString(),
                committerName: user.displayName || user.username,
                committerEmail: user.email,
                committerDate: faker.date.recent({ days: 60 }).toISOString(),
                userId: user.id,
                stats: JSON.stringify(stats),
                createdAt: new Date().toISOString()
            });
        } catch (e) {
            // console.error("Commit error", e);
        }
    }
    console.log("✅ Created 500+ commits");

    // 4. Create Pull Requests
    for (let i = 0; i < 150; i++) {
        const repo = repos[Math.floor(Math.random() * repos.length)];
        const user = users[Math.floor(Math.random() * users.length)];
        if (!repo || !user) continue;

        try {
            await db.insert(schema.pullRequests).values({
                id: faker.string.uuid(),
                number: i + 1,
                title: faker.hacker.verb() + " " + faker.hacker.adjective() + " " + faker.hacker.noun(),
                description: faker.lorem.sentence(),
                repositoryId: repo.id,
                authorId: user.id,
                status: Math.random() > 0.7 ? 'closed' : 'open',
                createdAt: faker.date.recent({ days: 30 }).toISOString(),
                updatedAt: faker.date.recent().toISOString()
            });
        } catch (e) { }
    }
    console.log("✅ Created pull requests");

    // 4. Create Activity Logs (Crucial for Globe/Stream)
    const actions = ["push", "pr_open", "comment", "fork", "star"];
    const targetTypes = ["repository", "pull_request", "issue"];

    for (let i = 0; i < 200; i++) {
        const user = users[Math.floor(Math.random() * users.length)];
        const repo = repos[Math.floor(Math.random() * repos.length)];

        if (!user || !repo) continue;

        try {
            await db.insert(schema.activities).values({
                id: faker.string.uuid(),
                userId: user.id,
                repositoryId: repo.id,
                type: actions[Math.floor(Math.random() * actions.length)],
                action: actions[Math.floor(Math.random() * actions.length)].toUpperCase(),
                targetType: targetTypes[Math.floor(Math.random() * targetTypes.length)],
                targetId: repo.id,
                payload: JSON.stringify({ message: faker.git.commitMessage() }),
                createdAt: faker.date.recent({ days: 1 }).toISOString()
            });
        } catch (e) { }
    }
    console.log("✅ Created activity logs");

    console.log("✨ Seeding complete!");
}

seed().catch(console.error);
