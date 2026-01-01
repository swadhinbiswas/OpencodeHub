import { getDatabase, schema } from "../src/db";
import { eq } from "drizzle-orm";
import readline from "readline";
import bcrypt from "bcryptjs";

// Utility to prompt input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (query: string): Promise<string> =>
    new Promise(resolve => rl.question(query, resolve));

async function main() {
    console.log("🚀 OpenCodeHub Admin Seeder");
    console.log("---------------------------");

    const username = process.argv[2] || await ask("Enter username: ");
    if (!username) {
        console.error("Username required");
        process.exit(1);
    }

    const email = process.argv[3] || await ask("Enter email (if creating new): ");
    const password = process.argv[4] || await ask("Enter password (if creating new): ");

    const db = getDatabase();

    // Check if user exists
    const user = await db.query.users.findFirst({
        where: eq(schema.users.username, username)
    });

    if (user) {
        console.log(`\nUser '${username}' found.`);
        if (user.isAdmin) {
            console.log("✅ User is already an Admin.");
        } else {
            console.log("Promoting to Admin...");
            await db.update(schema.users)
                .set({ isAdmin: true })
                .where(eq(schema.users.id, user.id));
            console.log("✅ User promoted to Admin successfully.");
        }
    } else {
        console.log(`\nUser '${username}' not found. Creating new admin user...`);
        if (!email || !password) {
            console.error("Error: Email and Password are required to create a new user.");
            process.exit(1);
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = crypto.randomUUID();

        await db.insert(schema.users).values({
            id: userId,
            username,
            email,
            passwordHash: hashedPassword,
            displayName: username, // Default display name
            isAdmin: true,
            isActive: true, // Auto-activate admin
            emailVerified: true // Auto-verify admin
        });

        console.log(`✅ Admin user '${username}' created successfully.`);
    }

    rl.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
