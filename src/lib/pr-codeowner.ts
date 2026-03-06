import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { resolveRepoPath } from "@/lib/git-storage";
import { CODEOWNERS_PATHS, parseCodeOwners, findOwnersForFile, expandOwnersToUsernames } from "@/lib/codeowners";

export async function checkCodeOwnerApprovalsForPR(
  db: NodePgDatabase<typeof schema>,
  pullRequestId: string
): Promise<{ ok: boolean; reason?: string }> {
  const pr = await db.query.pullRequests.findFirst({
    where: eq(schema.pullRequests.id, pullRequestId),
  });
  if (!pr) return { ok: false, reason: "Pull request not found" };

  const repo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.id, pr.repositoryId),
  });
  if (!repo) return { ok: false, reason: "Repository not found" };

  const localRepoPath = await resolveRepoPath(repo.diskPath);
  const { getChangedFiles } = await import("./git");
  const changedFiles = await getChangedFiles(localRepoPath, pr.baseBranch, pr.headBranch);
  if (changedFiles.length === 0) return { ok: true };

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  let codeOwnersContent: string | null = null;
  for (const candidatePath of CODEOWNERS_PATHS) {
    try {
      codeOwnersContent = await fs.readFile(path.join(localRepoPath, candidatePath), "utf-8");
      break;
    } catch {
      // continue
    }
  }

  if (!codeOwnersContent) {
    return { ok: true };
  }

  const codeOwners = parseCodeOwners(codeOwnersContent);
  const approvals = await db.query.pullRequestReviews.findMany({
    where: and(
      eq(schema.pullRequestReviews.pullRequestId, pr.id),
      eq(schema.pullRequestReviews.state, "approved")
    ),
    orderBy: (reviews, { desc }) => [desc(reviews.submittedAt)],
  });
  const approverUserIds = approvals.map((r) => r.reviewerId);
  if (approverUserIds.length === 0) {
    return { ok: false, reason: "Code owner approval required" };
  }

  const approverUsers = await db.query.users.findMany({
    where: (users, { inArray }) => inArray(users.id, approverUserIds),
  });
  const approverUsernames = new Set(approverUsers.map((u) => u.username));

  for (const file of changedFiles) {
    const owners = findOwnersForFile(codeOwners, file);
    if (owners.length === 0) continue;

    const expandedOwners = await expandOwnersToUsernames({
      db,
      repository: repo,
      owners,
    });

    const hasOwnerApproval = Array.from(expandedOwners).some((owner) =>
      approverUsernames.has(owner)
    );

    if (!hasOwnerApproval) {
      return {
        ok: false,
        reason: `Missing Code Owner approval for ${file}`,
      };
    }
  }

  return { ok: true };
}
