import { getDatabase, schema } from "@/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

export async function validateBasicAuth(
  header: string
): Promise<string | null> {
  if (!header.startsWith("Basic ")) return null;

  const token = header.split(" ")[1];
  const decoded = Buffer.from(token, "base64").toString("utf-8");
  const [username, password] = decoded.split(":");

  if (!username || !password) return null;

  const db = getDatabase();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, username),
  });

  if (!user || !user.passwordHash) return null;

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (isValid) return user.id;

  // Check Personal Access Token
  const pat = await db.query.personalAccessTokens.findFirst({
    where: (tokens, { and, eq }) =>
      and(eq(tokens.userId, user.id), eq(tokens.token, password)),
  });

  if (pat) {
    // Update last used at
    await db
      .update(schema.personalAccessTokens)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(schema.personalAccessTokens.id, pat.id));
    return user.id;
  }

  return null;
}
