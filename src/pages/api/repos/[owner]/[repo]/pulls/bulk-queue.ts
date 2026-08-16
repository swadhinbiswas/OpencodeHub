import { getDatabase, schema } from "@/db";
import {
  badRequest,
  forbidden,
  notFound,
  success,
  unauthorized,
} from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { addToMergeQueue, processNextInQueue } from "@/lib/merge-queue";
import { canWriteRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

const bulkQueueSchema = z.object({
  prIds: z.array(z.string().min(1)).min(1).max(100),
  priority: z.number().int().min(0).max(100).optional().default(0),
  mergeMethod: z
    .enum(["merge", "squash", "rebase"])
    .optional()
    .default("merge"),
});

export const POST: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!ownerName || !repoName) return badRequest("Missing parameters");

    const payload = await request.json().catch(() => null);
    const parsed = bulkQueueSchema.safeParse(payload || {});
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message || "Invalid bulk queue payload",
      );
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
    if (!(await canWriteRepo(user.id, repo, { isAdmin: user.isAdmin, tokenScopes: user.scopes }))) {
      return forbidden();
    }

    const uniquePrIds = [...new Set(parsed.data.prIds)];
    const repoPrs = await db.query.pullRequests.findMany({
      where: and(
        eq(schema.pullRequests.repositoryId, repo.id),
        inArray(schema.pullRequests.id, uniquePrIds),
      ),
      columns: {
        id: true,
        number: true,
        state: true,
        isDraft: true,
        isMerged: true,
        mergeableState: true,
      },
    });

    if (repoPrs.length !== uniquePrIds.length) {
      return badRequest("Some pull requests do not belong to this repository");
    }

    const byId = new Map(repoPrs.map((pr) => [pr.id, pr]));
    const added: Array<{
      id: string;
      number: number;
      queueEntryId: string;
      position: number | null;
    }> = [];
    const skipped: Array<{ id: string; number: number; reason: string }> = [];
    const failed: Array<{ id: string; number: number; reason: string }> = [];

    for (const prId of uniquePrIds) {
      const pr = byId.get(prId);
      if (!pr) continue;

      if (pr.state !== "open" || pr.isMerged) {
        skipped.push({
          id: pr.id,
          number: pr.number,
          reason: "Pull request is not open",
        });
        continue;
      }

      if (pr.isDraft) {
        skipped.push({
          id: pr.id,
          number: pr.number,
          reason: "Draft pull requests cannot enter the queue",
        });
        continue;
      }

      if (pr.mergeableState !== "clean") {
        skipped.push({
          id: pr.id,
          number: pr.number,
          reason: "Pull request is not merge-ready",
        });
        continue;
      }

      try {
        const entry = await addToMergeQueue({
          repositoryId: repo.id,
          pullRequestId: pr.id,
          addedById: user.id,
          priority: parsed.data.priority,
          mergeMethod: parsed.data.mergeMethod,
        });

        added.push({
          id: pr.id,
          number: pr.number,
          queueEntryId: entry.id,
          position: entry.position ?? null,
        });
      } catch (error: any) {
        const message =
          error?.message || "Failed to add pull request to merge queue";
        if (message.includes("already in the merge queue")) {
          skipped.push({ id: pr.id, number: pr.number, reason: message });
        } else {
          failed.push({ id: pr.id, number: pr.number, reason: message });
        }
      }
    }

    if (added.length > 0) {
      setTimeout(() => {
        processNextInQueue(repo.id).catch(console.error);
      }, 0);
    }

    return success({
      added,
      skipped,
      failed,
      summary: {
        added: added.length,
        skipped: skipped.length,
        failed: failed.length,
        mergeMethod: parsed.data.mergeMethod,
        priority: parsed.data.priority,
      },
    });
  },
);
