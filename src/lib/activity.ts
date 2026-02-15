
import { getDatabase, schema } from "@/db";
import { generateId } from "@/lib/utils";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Log a user activity to the database.
 * This is a fire-and-forget operation by default to avoid blocking the main request,
 * unless awaited explicitly.
 */
export async function logActivity(
    userId: string,
    type: string,
    action: string,
    targetType?: string,
    targetId?: string,
    repositoryId?: string,
    payload?: any,
    refType?: string,
    refName?: string,
    isPublic: boolean = true
) {
    try {
        const db = getDatabase() as NodePgDatabase<typeof schema>;

        await db.insert(schema.activities).values({
            id: generateId(),
            userId,
            repositoryId,
            type, // e.g. 'star', 'fork', 'push', 'issue', 'pr', 'follow'
            action, // e.g. 'created', 'opened', 'merged'
            targetType, // e.g. 'repository', 'issue', 'pull_request', 'user'
            targetId,
            refType,
            refName,
            payload: payload ? JSON.stringify(payload) : null,
            isPublic,
            createdAt: new Date(),
        });
    } catch (error) {
        console.error("Failed to log activity:", error);
        // We don't throw here to avoid failing the main request
    }
}
