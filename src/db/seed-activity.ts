
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { repositories, users, pullRequests, pullRequestReviews, pullRequestComments } from "@/db/schema";
import { generateId, now } from "@/lib/utils";
import { faker } from "@faker-js/faker";
import { eq } from "drizzle-orm";

async function seedActivity() {
    console.log("🌱 Seeding activity (PRs, Reviews)...");
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const allUsers = await db.query.users.findMany();
    const allRepos = await db.query.repositories.findMany();

    if (allUsers.length === 0 || allRepos.length === 0) {
        console.error("❌ Need users and repos first.");
        process.exit(1);
    }

    // Create Pull Requests
    const prsToCreate = 200;
    const createdPrs = [];

    console.log(`Creating ${prsToCreate} Pull Requests...`);

    for (let i = 0; i < prsToCreate; i++) {
        const repo = faker.helpers.arrayElement(allRepos);
        const author = faker.helpers.arrayElement(allUsers);

        // Simple branch names
        const headBranch = faker.git.branch();
        const baseBranch = repo.defaultBranch || "main";

        const prId = generateId("pr");

        await db.insert(pullRequests).values({
            id: prId,
            repositoryId: repo.id,
            number: i + 1, // Global sequence for simplicity here, ideally per-repo
            title: faker.git.commitMessage(),
            body: faker.lorem.paragraph(),
            state: faker.helpers.arrayElement(["open", "closed", "merged"]),
            authorId: author.id,
            headBranch,
            headSha: faker.git.commitSha(),
            baseBranch,
            baseSha: faker.git.commitSha(),
            createdAt: faker.date.recent({ days: 30 }),
            updatedAt: new Date(),
        });

        createdPrs.push({ id: prId, repoId: repo.id });
    }

    // Create Reviews & Comments
    const reviewsToCreate = 500;
    console.log(`Creating ${reviewsToCreate} Reviews & Comments...`);

    for (let i = 0; i < reviewsToCreate; i++) {
        const pr = faker.helpers.arrayElement(createdPrs);
        const reviewer = faker.helpers.arrayElement(allUsers);

        const reviewId = generateId("review");
        const state = faker.helpers.arrayElement(["approved", "changes_requested", "commented"]);

        // Create Review
        await db.insert(pullRequestReviews).values({
            id: reviewId,
            pullRequestId: pr.id,
            reviewerId: reviewer.id,
            state,
            body: faker.lorem.sentence(),
            submittedAt: faker.date.recent({ days: 10 }),
        });

        // Random comment on review
        if (Math.random() > 0.5) {
            await db.insert(pullRequestComments).values({
                id: generateId("comment"),
                pullRequestId: pr.id,
                reviewId: reviewId,
                authorId: reviewer.id,
                body: faker.hacker.phrase(),
                path: "src/main.ts",
                line: faker.number.int({ min: 1, max: 100 }),
                createdAt: faker.date.recent({ days: 5 }),
            });
        }
    }

    console.log("✅ Activity seeding complete!");
}

seedActivity().catch(console.error);
