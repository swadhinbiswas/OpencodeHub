import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { parseBody, unauthorized, badRequest, notFound, success, forbidden, serverError } from "@/lib/api";
import { z } from "zod";
import { resolveRepoPath } from "@/lib/git-storage";
import { getFileContent, commitFile } from "@/lib/git";
import { canWriteRepo } from "@/lib/permissions";
import { withErrorHandler } from "@/lib/errors";

const applySuggestionSchema = z.object({
  commentId: z.string(),
  commitMessage: z.string().optional(),
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) return unauthorized();

  const parsed = await parseBody(request, applySuggestionSchema);
  if ("error" in parsed) return parsed.error;

  const { owner, repo, number } = params;
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  
  const repoOwner = await db.query.users.findFirst({
    where: eq(schema.users.username, owner as string),
  });
  if (!repoOwner) return notFound("Repository not found");

  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, repoOwner.id),
      eq(schema.repositories.name, repo as string)
    ),
  });
  if (!repository) return notFound("Repository not found");

  if (!(await canWriteRepo(tokenPayload.userId, repository, { isAdmin: tokenPayload.isAdmin }))) {
    return forbidden();
  }

  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(schema.pullRequests.repositoryId, repository.id),
      eq(schema.pullRequests.number, parseInt(number as string))
    )
  });
  if (!pr) return notFound("Pull request not found");
  if (pr.state !== "open") return badRequest("PR is not open");

  const comment = await db.query.pullRequestComments.findFirst({
    where: eq(schema.pullRequestComments.id, parsed.data.commentId)
  });
  if (!comment) return notFound("Comment not found");
  if (comment.pullRequestId !== pr.id) return badRequest("Comment does not belong to this PR");
  if (!comment.suggestionContent) return badRequest("Comment does not contain a suggestion");
  if (comment.suggestionApplied) return badRequest("Suggestion already applied");
  if (!comment.path || !comment.line) return badRequest("Comment lacks file path or line info");

  // Read the original file
  const repoPath = await resolveRepoPath(repository.diskPath);
  let fileContent;
  try {
      fileContent = await getFileContent(repoPath, pr.headBranch, comment.path);
      if (!fileContent) return notFound("File not found in the target branch");
  } catch (e) {
      return notFound("File not found in the target branch");
  }

  // Replace lines
  const lines = fileContent.content.split('\n');
  const startIdx = (comment.startLine || comment.line) - 1;
  const endIdx = comment.line - 1;
  
  if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
      return badRequest("Invalid line range for suggestion");
  }

  // Slice out the old lines, insert the new lines
  const suggestedLines = comment.suggestionContent.split('\n');
  lines.splice(startIdx, endIdx - startIdx + 1, ...suggestedLines);
  const newContent = lines.join('\n');

  const commitMessage = parsed.data.commitMessage || `Apply suggestion to ${comment.path}`;
  const currentUser = await db.query.users.findFirst({ where: eq(schema.users.id, tokenPayload.userId) });
  if (!currentUser) return unauthorized();

  const author = { name: currentUser.displayName || currentUser.username, email: currentUser.email };
  
  let newSha;
  try {
      newSha = await commitFile(repoPath, pr.headBranch, comment.path, newContent, commitMessage, author);
  } catch (e) {
      console.error(e);
      return serverError("Failed to commit the suggestion");
  }

  // Mark suggestion as applied
  await db.update(schema.pullRequestComments).set({
      suggestionApplied: true,
      suggestionAppliedById: currentUser.id,
      suggestionAppliedAt: new Date(),
      suggestionCommitSha: newSha,
  }).where(eq(schema.pullRequestComments.id, comment.id));

  // Update PR head sha
  await db.update(schema.pullRequests).set({
      headSha: newSha,
      updatedAt: new Date(),
  }).where(eq(schema.pullRequests.id, pr.id));

  return success({ message: "Suggestion applied successfully", commitSha: newSha });
});
