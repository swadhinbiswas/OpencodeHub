import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import bcrypt from "bcryptjs";
import { and, eq, or } from "drizzle-orm";
import { hashPersonalAccessToken, verifyPersonalAccessTokenValue } from "@/lib/personal-access-token";

export async function validateBasicAuth(
  header: string
): Promise<string | null> {
  if (!header.startsWith("Basic ")) return null;

  const token = header.split(" ")[1];
  const decoded = Buffer.from(token, "base64").toString("utf-8");
  const [username, password] = decoded.split(":");

  if (!username || !password) return null;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, username),
  });

  if (!user) return null;

  // Check if password looks like a Personal Access Token (och_xxx format)
  if (password.startsWith("och_")) {
    const hashedToken = hashPersonalAccessToken(password);
    const pat = await db.query.personalAccessTokens.findFirst({
      where: and(
        eq(schema.personalAccessTokens.userId, user.id),
        or(
          eq(schema.personalAccessTokens.token, hashedToken),
          eq(schema.personalAccessTokens.token, password)
        )
      ),
    });

    if (pat && verifyPersonalAccessTokenValue(pat.token, password)) {
      // Update last used at
      await db
        .update(schema.personalAccessTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.personalAccessTokens.id, pat.id));
      console.log(`[validateBasicAuth] Authenticated ${username} via PAT`);
      return user.id;
    }
    // Token format but not valid
    return null;
  }

  // Fall back to password check
  if (!user.passwordHash) return null;

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (isValid) {
    console.log(`[validateBasicAuth] Authenticated ${username} via password`);
    return user.id;
  }

  return null;
}
