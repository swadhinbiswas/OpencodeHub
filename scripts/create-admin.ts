/**
 * Create Admin Account Script
 * Run with: bun run scripts/create-admin.ts
 */

import { createClient } from "@libsql/client";
import * as bcrypt from "bcryptjs";

// Load from .env
const DATABASE_URL = process.env.DATABASE_URL || "libsql://opencodehub-swadhinbiswas.aws-ap-south-1.turso.io";
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN;

if (!DATABASE_AUTH_TOKEN) {
    console.error("❌ DATABASE_AUTH_TOKEN is required. Run with: bun run scripts/create-admin.ts");
    console.error("   Make sure your .env file has DATABASE_AUTH_TOKEN set.");
    process.exit(1);
}

// Admin account details
const ADMIN_USERNAME = "admin";
const ADMIN_EMAIL = "admin@opencodehub.local";
const ADMIN_PASSWORD = "Admin@123"; // Change this!

async function main() {
    console.log("🔌 Connecting to database...");

    const client = createClient({
        url: DATABASE_URL,
        authToken: DATABASE_AUTH_TOKEN,
    });

    // Check if admin already exists
    const existing = await client.execute({
        sql: "SELECT id, username, is_admin FROM users WHERE username = ?",
        args: [ADMIN_USERNAME]
    });

    if (existing.rows.length > 0) {
        console.log("⚠️  Admin user already exists. Updating to admin role...");
        await client.execute({
            sql: "UPDATE users SET is_admin = 1 WHERE username = ?",
            args: [ADMIN_USERNAME]
        });
        console.log("✅ Admin role granted to existing user:", existing.rows[0].username);
        return;
    }

    // Hash password
    console.log("🔐 Hashing password...");
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    // Generate unique ID
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create admin user
    console.log("👤 Creating admin user...");

    await client.execute({
        sql: `INSERT INTO users (id, username, email, password_hash, display_name, is_admin, is_active, email_verified, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?, ?)`,
        args: [id, ADMIN_USERNAME, ADMIN_EMAIL, passwordHash, "Administrator", now, now]
    });

    console.log("✅ Admin account created successfully!");
    console.log("");
    console.log("📋 Admin Credentials:");
    console.log(`   Username: ${ADMIN_USERNAME}`);
    console.log(`   Email:    ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log("");
    console.log("⚠️  Please change the password after first login!");
}

main().catch(err => {
    console.error("❌ Error:", err.message);
    process.exit(1);
});
