/**
 * @mention parsing and notification dispatch (WS2-10)
 *
 * Extracts `@username` references from free text and creates in-app
 * notifications for the mentioned users. Mentions are resolved against
 * the users table (case-insensitive), and self-mentions are skipped.
 */
import { getDatabase, schema } from "@/db";
import { eq, inArray, and, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";

// Negative lookbehind excludes emails (alice@example.com) and markdown links
const MENTION_RE = /(?<![A-Za-z0-9_.-])@([A-Za-z0-9_](?:[A-Za-z0-9_-]{0,38}[A-Za-z0-9_])?)/g;

export function extractMentions(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const matches = text.match(MENTION_RE) || [];
  for (const m of matches) {
    seen.add(m.slice(1));
  }
  return [...seen];
}

export interface MentionNotifyOptions {
  text: string;
  actorId: string;
  repositoryId: string;
  subjectType: "issue" | "pull_request" | "comment";
  subjectId: string;
  url: string;
  titlePrefix?: string;
}

/**
 * Notify all users mentioned in `text` (excluding the actor).
 * Returns the number of notifications created.
 */
export async function notifyMentionedUsers(
  options: MentionNotifyOptions,
): Promise<number> {
  const usernames = extractMentions(options.text);
  if (usernames.length === 0) return 0;

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const [mentioned, actor] = await Promise.all([
    db.query.users.findMany({
      where: and(
        inArray(schema.users.username, usernames),
        ne(schema.users.id, options.actorId),
      ),
      columns: { id: true, username: true },
    }),
    db.query.users.findFirst({
      where: eq(schema.users.id, options.actorId),
      columns: { username: true },
    }),
  ]);
  if (mentioned.length === 0) return 0;

  const actorName = actor?.username || "Someone";
  const prefix = options.titlePrefix || "mentioned you";
  const now = new Date();
  const snippet = options.text.replace(/\s+/g, " ").slice(0, 140);

  try {
    await db.insert(schema.notifications).values(
      mentioned.map((u) => ({
        id: generateId(),
        userId: u.id,
        repositoryId: options.repositoryId,
        type: "mention",
        title: `@${actorName} ${prefix}`,
        body: `@${actorName} mentioned you in ${options.subjectType}: ${snippet}`,
        url: options.url,
        actorId: options.actorId,
        subjectType: options.subjectType,
        subjectId: options.subjectId,
        reason: "mention",
        isRead: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      })),
    );
  } catch (err) {
    logger.error({ err, usernames: mentioned.map((u) => u.username) }, "Failed to create mention notifications");
    return 0;
  }

  return mentioned.length;
}
