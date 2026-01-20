
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { repositories, users } from "@/db/schema";
import { generateId, slugify, now } from "@/lib/utils";
import { faker } from "@faker-js/faker";
import { initRepository } from "@/lib/git";
import { eq } from "drizzle-orm";
import { join } from "path";
import fs from "fs/promises";

async function seed() {
    console.log("🌱 Starting large-scale seeding...");
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get all users
    const allUsers = await db.query.users.findMany();
    if (allUsers.length === 0) {
        console.error("❌ No users found. Run 'bun run db:seed' first.");
        process.exit(1);
    }

    console.log(`Found ${allUsers.length} users.`);

    const reposToCreate = 500;
    const reposPath = process.env.GIT_REPOS_PATH || "./data/repos";

    console.log(`Creating ${reposToCreate} repositories...`);

    for (let i = 0; i < reposToCreate; i++) {
        const user = faker.helpers.arrayElement(allUsers);
        const name = faker.word.adjective() + "-" + faker.word.noun();
        const slug = slugify(name);

        // Ensure unique slug for user
        const existing = await db.query.repositories.findFirst({
            where: (repositories, { and, eq }) =>
                and(eq(repositories.ownerId, user.id), eq(repositories.slug, slug))
        });

        if (existing) {
            continue; // Skip duplicate
        }

        const repoId = generateId("repo");
        const description = faker.company.catchPhrase();
        const diskPath = join(process.cwd(), "data", "repos", user.username, `${slug}.git`);
        const sshPort = process.env.GIT_SSH_PORT || "2222";
        const siteUrl = process.env.SITE_URL || "http://localhost:3000";

        // 1. Create DB Record
        await db.insert(repositories).values({
            id: repoId,
            name,
            slug,
            description,
            ownerId: user.id,
            ownerType: "user",
            visibility: faker.helpers.arrayElement(["public", "private"]),
            defaultBranch: "main",
            diskPath,
            sshCloneUrl: `ssh://git@localhost:${sshPort}/${user.username}/${slug}.git`,
            httpCloneUrl: `${siteUrl}/${user.username}/${slug}.git`,
            starCount: faker.number.int({ min: 0, max: 1000 }),
            forkCount: faker.number.int({ min: 0, max: 50 }),
            watchCount: faker.number.int({ min: 0, max: 100 }),
            language: faker.helpers.arrayElement(["TypeScript", "JavaScript", "Python", "Go", "Rust", "Java"]),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // 2. Initialize Git Repo on Disk
        try {
            await initRepository(diskPath, {
                defaultBranch: "main",
                readme: true,
                repoName: name,
                ownerName: user.username,
            });
        } catch (e) {
            console.error(`Failed to init repo ${name}:`, e);
        }

        if (i % 50 === 0) {
            console.log(`Created ${i} repositories...`);
        }
    }

    console.log("✅ Seeding complete!");
    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
});
