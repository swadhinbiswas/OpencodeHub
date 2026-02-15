import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "@/lib/logger";

function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch (error) {}
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

async function getCodeOwnerBlockers(
  db: NodePgDatabase<typeof schema>,
  repository: typeof schema.repositories.$inferSelect,
  repoDiskPath: string,
  prId: string,
  baseBranch: string,
  headBranch: string
): Promise<string[]> {
  const blockers: string[] = [];

  try {
    const { getChangedFiles } = await import("./git");
    const { parseCodeOwners, findOwnersForFile, expandOwnersToUsernames } = await import("./codeowners");
    const fs = await import("fs/promises");
    const path = await import("path");

    const changedFiles = await getChangedFiles(repoDiskPath, baseBranch, headBranch);
    if (changedFiles.length === 0) return blockers;

    const possiblePaths = ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"];
    let codeOwnersContent: string | null = null;

    for (const p of possiblePaths) {
      try {
        codeOwnersContent = await fs.readFile(path.join(repoDiskPath, p), "utf-8");
        break;
      } catch (error) {}
    }

    if (!codeOwnersContent) return blockers;

    const codeOwners = parseCodeOwners(codeOwnersContent);

    const approvals = await db.query.pullRequestReviews.findMany({
      where: and(
        eq(schema.pullRequestReviews.pullRequestId, prId),
        eq(schema.pullRequestReviews.state, "approved")
      ),
    });

    const approverUserIds = approvals.map((review) => review.reviewerId);
    const approverUsers = approverUserIds.length
      ? await db.query.users.findMany({
          where: (users, { inArray }) => inArray(users.id, approverUserIds),
        })
      : [];
    const approverUsernames = new Set(approverUsers.map((user) => user.username));

    for (const file of changedFiles) {
      const owners = findOwnersForFile(codeOwners, file);
      if (owners.length === 0) continue;

      const expandedOwners = await expandOwnersToUsernames({
        db,
        repository,
        owners,
      });

      const hasOwnerApproval = Array.from(expandedOwners).some((owner) =>
        approverUsernames.has(owner)
      );

      if (!hasOwnerApproval) {
        blockers.push(`Missing Code Owner approval for ${file} (requires: ${owners.join(", ")})`);
      }
    }
  } catch (error) {
    logger.error({ error, prId }, "Failed to check Code Owners for auto-merge rules");
  }

  return blockers;
}

export async function evaluateAutoMergeRules(prId: string): Promise<string[]> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  const pr = await db.query.pullRequests.findFirst({
    where: eq(schema.pullRequests.id, prId),
    with: {
      checks: true,
      reviews: true,
      labels: { with: { label: true } },
    },
  });

  if (!pr) return ["Pull request not found"];

  const rules = await db.query.autoMergeRules.findMany({
    where: and(
      eq(schema.autoMergeRules.repositoryId, pr.repositoryId),
      eq(schema.autoMergeRules.isEnabled, true)
    ),
  });

  if (rules.length === 0) return [];

  const labelNames = unique((pr.labels || []).map((item) => item.label?.name).filter(Boolean) as string[]);
  const approvals = (pr.reviews || []).filter((review) => review.state === "approved");
  const approvalCount = unique(approvals.map((review) => review.reviewerId)).length;
  const failingChecks = (pr.checks || []).filter(
    (check) => check.status === "completed" && check.conclusion !== "success" && check.conclusion !== "neutral"
  );
  const pendingChecks = (pr.checks || []).filter((check) => check.status !== "completed");

  const blockers: string[] = [];

  for (const rule of rules) {
    const matchLabels = parseList(rule.matchLabels);
    const requiredLabels = parseList(rule.requiredLabels);
    const requiredChecks = parseList(rule.requiredChecks);

    if (matchLabels.length > 0 && !matchLabels.every((label) => labelNames.includes(label))) {
      continue;
    }

    const recordMismatch = async (reason: string) => {
      await db.update(schema.autoMergeRules)
        .set({
          lastMismatchReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(schema.autoMergeRules.id, rule.id));
    };

    if (!rule.allowDraft && pr.isDraft) {
      const reason = `Auto-merge rule "${rule.name}" blocks drafts`;
      blockers.push(reason);
      await recordMismatch(reason);
      continue;
    }

    if (requiredLabels.length > 0) {
      const missingLabels = requiredLabels.filter((label) => !labelNames.includes(label));
      if (missingLabels.length > 0) {
        const reason = `Rule "${rule.name}" missing labels: ${missingLabels.join(", ")}`;
        blockers.push(reason);
        await recordMismatch(reason);
        continue;
      }
    }

    if (requiredChecks.length > 0) {
      const checkNames = (pr.checks || []).map((check) => check.name);
      const missingChecks = requiredChecks.filter((check) => !checkNames.includes(check));
      if (missingChecks.length > 0) {
        const reason = `Rule "${rule.name}" missing checks: ${missingChecks.join(", ")}`;
        blockers.push(reason);
        await recordMismatch(reason);
        continue;
      }

      if (failingChecks.length > 0) {
        const reason = `Rule "${rule.name}" has failing checks`;
        blockers.push(reason);
        await recordMismatch(reason);
        continue;
      }

      if (pendingChecks.length > 0) {
        const reason = `Rule "${rule.name}" has pending checks`;
        blockers.push(reason);
        await recordMismatch(reason);
        continue;
      }
    }

    if ((rule.minApprovals || 0) > approvalCount) {
      const reason = `Rule "${rule.name}" needs ${rule.minApprovals} approvals (has ${approvalCount})`;
      blockers.push(reason);
      await recordMismatch(reason);
      continue;
    }

    if ((rule.minTimeInQueueMinutes || 0) > 0) {
      if (!pr.autoMergeEnabledAt) {
        const reason = `Rule "${rule.name}" requires auto-merge delay before merge`;
        blockers.push(reason);
        await recordMismatch(reason);
        continue;
      }

      const elapsedMinutes = Math.floor(
        (Date.now() - new Date(pr.autoMergeEnabledAt).getTime()) / 60000
      );
      if (elapsedMinutes < (rule.minTimeInQueueMinutes || 0)) {
        const reason = `Rule "${rule.name}" requires ${rule.minTimeInQueueMinutes} minute delay (elapsed ${elapsedMinutes})`;
        blockers.push(reason);
        await recordMismatch(reason);
        continue;
      }
    }

    if (rule.requireCodeOwner) {
      const repo = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, pr.repositoryId),
      });
      if (repo?.diskPath) {
        const codeOwnerBlockers = await getCodeOwnerBlockers(
          db,
          repo,
          repo.diskPath,
          pr.id,
          pr.baseBranch,
          pr.headBranch
        );
        if (codeOwnerBlockers.length > 0) {
          const reasons = codeOwnerBlockers.map((message) => `Rule "${rule.name}": ${message}`);
          blockers.push(...reasons);
          await recordMismatch(reasons[0]);
          continue;
        }
      }
    }

    await db.update(schema.autoMergeRules)
      .set({
        matchCount: (rule.matchCount || 0) + 1,
        lastMatchedAt: new Date(),
        lastMismatchReason: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.autoMergeRules.id, rule.id));
  }

  return blockers;
}
