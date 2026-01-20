/**
 * Seed demo notifications for testing
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase, schema } from "@/db";
import { notifications, users, repositories } from "@/db/schema";
import { generateId, now } from "@/lib/utils";
import { faker } from "@faker-js/faker";

async function seedNotifications() {
    console.log("🔔 Seeding notifications...");
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const allUsers = await db.query.users.findMany();
    const allRepos = await db.query.repositories.findMany({ limit: 50 });

    if (allUsers.length === 0) {
        console.error("❌ No users found.");
        process.exit(1);
    }

    const notificationTypes = [
        { type: "mention", reason: "mention", titlePrefix: "You were mentioned in" },
        { type: "assign", reason: "assign", titlePrefix: "You were assigned to" },
        { type: "review_request", reason: "review_requested", titlePrefix: "Review requested for" },
        { type: "comment", reason: "comment", titlePrefix: "New comment on" },
        { type: "ci_failed", reason: "ci_activity", titlePrefix: "CI failed for" },
        { type: "ci_success", reason: "ci_activity", titlePrefix: "CI passed for" },
        { type: "star", reason: "subscribed", titlePrefix: "New star on" },
    ];

    const notifsToCreate = 100;
    console.log(`Creating ${notifsToCreate} notifications...`);

    for (let i = 0; i < notifsToCreate; i++) {
        const targetUser = faker.helpers.arrayElement(allUsers);
        const actor = faker.helpers.arrayElement(allUsers.filter(u => u.id !== targetUser.id)) || allUsers[0];
        const repo = allRepos.length > 0 ? faker.helpers.arrayElement(allRepos) : null;
        const notifType = faker.helpers.arrayElement(notificationTypes);

        const subjectTypes = ["issue", "pull_request", "commit"];
        const subjectType = faker.helpers.arrayElement(subjectTypes);
        const subjectId = `${subjectType}_${faker.string.alphanumeric(8)}`;

        const title = repo
            ? `${notifType.titlePrefix} ${repo.name}#${faker.number.int({ min: 1, max: 500 })}`
            : `${notifType.titlePrefix} a ${subjectType.replace("_", " ")}`;

        await db.insert(notifications).values({
            id: generateId("notif"),
            userId: targetUser.id,
            repositoryId: repo?.id,
            type: notifType.type,
            title,
            body: faker.lorem.sentence(),
            url: repo ? `/${repo.name}/${subjectType}s/${faker.number.int({ min: 1, max: 100 })}` : "#",
            actorId: actor.id,
            subjectType,
            subjectId,
            reason: notifType.reason,
            isRead: faker.datatype.boolean({ probability: 0.3 }),
            isArchived: faker.datatype.boolean({ probability: 0.1 }),
            createdAt: faker.date.recent({ days: 14 }),
            updatedAt: new Date(),
        });
    }

    console.log("✅ Notifications seeded!");
}

seedNotifications().catch(console.error);
