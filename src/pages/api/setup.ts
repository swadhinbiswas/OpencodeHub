import type { APIRoute } from "astro";
import { saveConfig, isConfigured } from "@/lib/config";
import { exec } from "child_process";
import { promisify } from "util";
import bcrypt from "bcryptjs";
import { getDatabase, resetDatabase, schema } from "@/db";
import { createSession } from "@/lib/auth";
import crypto from "crypto";

const execAsync = promisify(exec);

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // If already configured, prevent re-setup
    if (isConfigured()) {
      return new Response(JSON.stringify({ error: "Already configured" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await request.json();
    const { database, cache, admin } = data;

    if (!admin?.username || !admin?.email || !admin?.password) {
      return new Response(JSON.stringify({ error: "Admin credentials missing" }), { status: 400 });
    }

    // 1. Save config which sets process.env overrides
    saveConfig({
      DATABASE_URL: database.url,
      DATABASE_DRIVER: database.driver,
      REDIS_URL: cache.url
    });

    // 2. Run Drizzle migrations
    try {
      console.log("Pushing database schema...");
      await execAsync("bun run db:push", {
        env: {
          ...process.env,
          DATABASE_URL: database.url,
          DATABASE_DRIVER: database.driver
        }
      });
    } catch (pushError: any) {
      console.error("Database schema push failed", pushError);
      return new Response(JSON.stringify({ error: "Failed to initialize database: " + pushError.message }), { status: 500 });
    }

    // 3. Connect to DB and Create Admin User
    resetDatabase();
    const db = getDatabase();
    const hashedPassword = await bcrypt.hash(admin.password, 10);
    const userId = crypto.randomUUID();

    await (db as any).insert(schema.users).values({
      id: userId,
      username: admin.username,
      email: admin.email,
      passwordHash: hashedPassword,
      displayName: admin.username,
      isAdmin: true,
      isActive: true,
      emailVerified: true
    });

    // 4. Log the user in (create session)
    const sessionCookie = await createSession(userId);
    cookies.set("och_session", sessionCookie, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Setup error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
