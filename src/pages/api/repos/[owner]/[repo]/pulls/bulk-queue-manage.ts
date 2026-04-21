import { getDatabase, schema } from "@/db";
import {
  badRequest,
  forbidden,
  notFound,
  success,
  unauthorized,
} from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { removeFromMergeQueue, updateQueuePriority } from "@/lib/merge-queue";
import { canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

const bulkQueueManageSchema = z.object({
  prIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["reprioritize", "remove"]),
  priority: z.number().int().min(-100).max(100).optional(),
});

export const POST: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!ownerName || !repoName) return badRequest("Missing parameters");

    const payload = await request.json().catch(() => null);
    const parsed = bulkQueueManageSchema.safeParse(payload || {});
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message || "Invalid bulk queue control payload",
      );
    }

    if (
      parsed.data.action === "reprioritize" &&
      typeof parsed.data.priority !== "number"
    ) {
      return badRequest("Priority is required for reprioritize");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const owner = await db.query.users.findFirst({
      where: eq(schema.users.username, ownerName),
    });
    if (!owner) return notFound("Repository not found");

    const repo = await db.query.repositories.findFirst({
      where: and(
        eq(schema.repositories.ownerId, owner.id),
        eq(schema.repositories.name, repoName),
      ),
    });
    if (!repo) return notFound("Repository not found");
    if (!(await canWriteRepo(user.id, repo, { isAdmin: user.isAdmin }))) {
      return forbidden();
    }

    const uniquePrIds = [...new Set(parsed.data.prIds)];
    const repoPrs = await db.query.pullRequests.findMany({
      where: and(
        eq(schema.pullRequests.repositoryId, repo.id),
        inArray(schema.pullRequests.id, uniquePrIds),
      ),
      columns: { id: true, number: true },
    });

    if (repoPrs.length !== uniquePrIds.length) {
      return badRequest("Some pull requests do not belong to this repository");
    }

    const prMap = new Map(repoPrs.map((pr) => [pr.id, pr]));
    const queueEntries = await db.query.mergeQueue.findMany({
      where: and(
        eq(schema.mergeQueue.repositoryId, repo.id),
        inArray(schema.mergeQueue.pullRequestId, uniquePrIds),
      ),
      columns: {
        id: true,
        pullRequestId: true,
        priority: true,
        status: true,
      },
    });

    const entryByPrId = new Map(
      queueEntries.map((entry) => [entry.pullRequestId, entry]),
    );
    const updated: Array<{ id: string; number: number; action: string }> = [];
    const skipped: Array<{ id: string; number: number; reason: string }> = [];
    const failed: Array<{ id: string; number: number; reason: string }> = [];

    for (const prId of uniquePrIds) {
      const pr = prMap.get(prId);
      if (!pr) continue;

      const entry = entryByPrId.get(prId);
      if (!entry) {
        skipped.push({
          id: pr.id,
          number: pr.number,
          reason: "Pull request is not currently queued",
        });
        continue;
      }

      try {
        if (parsed.data.action === "remove") {
          await removeFromMergeQueue(pr.id);
        } else {
          await updateQueuePriority(entry.id, parsed.data.priority!);
        }

        updated.push({
          id: pr.id,
          number: pr.number,
          action: parsed.data.action,
        });
      } catch (error: any) {
        failed.push({
          id: pr.id,
          number: pr.number,
          reason: error?.message || "Failed to manage queue entry",
        });
      }
    }

    return success({
      updated,
      skipped,
      failed,
      summary: {
        updated: updated.length,
        skipped: skipped.length,
        failed: failed.length,
        action: parsed.data.action,
        priority: parsed.data.priority ?? null,
      },
    });
  },
);
