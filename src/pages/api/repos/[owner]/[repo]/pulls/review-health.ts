import { getDatabase, schema } from "@/db";
import {
  badRequest,
  forbidden,
  notFound,
  success,
  unauthorized,
} from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { dismissStaleReviews } from "@/lib/multi-reviewer";
import { canWriteRepo } from "@/lib/permissions";
import { generateId } from "@/lib/utils";
import type { APIRoute } from "astro";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

const reviewHealthSchema = z.object({
  prIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["dismiss-stale", "escalate"]),
  thresholdHours: z.number().int().min(1).max(168).optional().default(24),
});

export const POST: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const { owner: ownerName, repo: repoName } = params;
    const user = locals.user;

    if (!user) return unauthorized();
    if (!ownerName || !repoName) return badRequest("Missing parameters");

    const payload = await request.json().catch(() => null);
    const parsed = reviewHealthSchema.safeParse(payload || {});
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message || "Invalid review health payload",
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
    const pullRequests = await db.query.pullRequests.findMany({
      where: and(
        eq(schema.pullRequests.repositoryId, repo.id),
        inArray(schema.pullRequests.id, uniquePrIds),
      ),
      columns: {
        id: true,
        number: true,
        title: true,
        headSha: true,
      },
    });

    if (pullRequests.length !== uniquePrIds.length) {
      return badRequest("Some pull requests do not belong to this repository");
    }

    const thresholdDate = new Date(
      Date.now() - parsed.data.thresholdHours * 60 * 60 * 1000,
    );
    const requestedReviewers = await db.query.pullRequestReviewers.findMany({
      where: inArray(schema.pullRequestReviewers.pullRequestId, uniquePrIds),
      with: {
        user: {
          columns: { id: true, username: true, displayName: true },
        },
      },
    });
    const reviews = await db.query.pullRequestReviews.findMany({
      where: inArray(schema.pullRequestReviews.pullRequestId, uniquePrIds),
      orderBy: [desc(schema.pullRequestReviews.submittedAt)],
    });

    const latestReviewByPrAndUser = new Map<string, (typeof reviews)[number]>();
    for (const review of reviews) {
      const key = `${review.pullRequestId}:${review.reviewerId}`;
      if (!latestReviewByPrAndUser.has(key)) {
        latestReviewByPrAndUser.set(key, review);
      }
    }

    const updated: Array<{ id: string; number: number; action: string }> = [];
    const skipped: Array<{ id: string; number: number; reason: string }> = [];
    const failed: Array<{ id: string; number: number; reason: string }> = [];

    for (const pr of pullRequests) {
      try {
        if (parsed.data.action === "dismiss-stale") {
          const dismissed = await dismissStaleReviews(
            pr.id,
            user.id,
            "Dismissed from repository review operations",
          );
          if (dismissed === 0) {
            skipped.push({
              id: pr.id,
              number: pr.number,
              reason: "No stale reviews to dismiss",
            });
            continue;
          }
          updated.push({
            id: pr.id,
            number: pr.number,
            action: `dismissed ${dismissed} stale reviews`,
          });
          continue;
        }

        const pendingRequests = requestedReviewers.filter(
          (request) => request.pullRequestId === pr.id,
        );
        let escalatedCount = 0;

        for (const request of pendingRequests) {
          const latestReview = latestReviewByPrAndUser.get(
            `${request.pullRequestId}:${request.userId}`,
          );
          const latestState = latestReview?.state || null;
          const stillPending =
            !latestState ||
            latestState === "dismissed" ||
            latestState === "pending";

          if (!stillPending) continue;
          if (new Date(request.requestedAt) > thresholdDate) continue;

          await db.insert(schema.notifications).values({
            id: generateId(),
            userId: request.userId,
            repositoryId: repo.id,
            type: "review_request",
            title: `Review SLA escalation for PR #${pr.number}`,
            body: `Review request on ${ownerName}/${repoName} has been pending for at least ${parsed.data.thresholdHours} hours.`,
            url: `/${ownerName}/${repoName}/pulls/${pr.number}`,
            actorId: user.id,
            subjectType: "pull_request",
            subjectId: pr.id,
            reason: "review_requested",
            isRead: false,
            isArchived: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          escalatedCount += 1;
        }

        if (escalatedCount === 0) {
          skipped.push({
            id: pr.id,
            number: pr.number,
            reason: "No overdue review requests matched the SLA threshold",
          });
          continue;
        }

        await db.insert(schema.auditLogs).values({
          id: generateId(),
          userId: user.id,
          repositoryId: repo.id,
          action: "pull_request_review_sla_escalated",
          actorType: "user",
          actorId: user.id,
          targetType: "pull_request",
          targetId: pr.id,
          targetName: pr.title,
          data: JSON.stringify({
            thresholdHours: parsed.data.thresholdHours,
            escalatedCount,
          }),
          createdAt: new Date(),
        });

        updated.push({
          id: pr.id,
          number: pr.number,
          action: `escalated ${escalatedCount} review requests`,
        });
      } catch (error: any) {
        failed.push({
          id: pr.id,
          number: pr.number,
          reason: error?.message || "Failed to manage review health",
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
        thresholdHours: parsed.data.thresholdHours,
      },
    });
  },
);
