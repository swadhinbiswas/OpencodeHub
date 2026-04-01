import type { APIRoute } from "astro";
import { db } from "../../../../../../../db/index";
import { pullRequests } from "../../../../../../../db/schema/pull-requests";
import { stackedPrs } from "../../../../../../../db/schema/stacked-prs";
import { repositories } from "../../../../../../../db/schema/repositories";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const SubmitStackSchema = z.object({
  branches: z.array(z.object({
    name: z.string(),
    parent: z.string(),
    commitHash: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    isDraft: z.boolean().default(false)
  }))
});

export const POST: APIRoute = async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) return new Response("Missing repo info", { status: 400 });

  try {
    const body = await request.json();
    const parsed = SubmitStackSchema.parse(body);

    const repository = await db.query.repositories.findFirst({
      where: and(eq(repositories.owner, owner), eq(repositories.name, repo))
    });

    if (!repository) return new Response("Repository not found", { status: 404 });

    // Perform the entire stack creation transactionally
    const result = await db.transaction(async (tx) => {
      let createdPrs = [];
      let stackIdentifier = \`stack_$\{Date.now()\}\`; // Unique ID for this push session
      
      for (let i = 0; i < parsed.branches.length; i++) {
        const branchData = parsed.branches[i];
        
        // 1. Create or Find the Pull Request
        let prId;
        const existingPr = await tx.select().from(pullRequests).where(
          and(eq(pullRequests.repositoryId, repository.id), eq(pullRequests.headBranch, branchData.name))
        ).limit(1);

        if (existingPr.length > 0) {
          prId = existingPr[0].id;
          // Update PR if needed
          await tx.update(pullRequests).set({
            baseBranch: branchData.parent,
            title: branchData.title || existingPr[0].title,
            body: branchData.description || existingPr[0].body
          }).where(eq(pullRequests.id, prId));
        } else {
          // Insert new PR
          const newPr = await tx.insert(pullRequests).values({
            repositoryId: repository.id,
            number: Math.floor(Math.random() * 10000), // Should use standard auto-increment or sequence
            headBranch: branchData.name,
            baseBranch: branchData.parent,
            title: branchData.title || \`Update \$\{branchData.name\}\`,
            body: branchData.description || "",
            status: "OPEN",
            isDraft: branchData.isDraft,
            authorId: 1 // Stubbed to admin
          }).returning();
          prId = newPr[0].id;
        }

        createdPrs.push({ prId, branch: branchData.name });

        // 2. Manage Stack Tracking Relation
        // We delete any old stack relation for this PR and re-insert 
        // to handle re-ordering or moving branches dynamically.
        await tx.delete(stackedPrs).where(eq(stackedPrs.prId, prId));
        
        await tx.insert(stackedPrs).values({
          prId: prId,
          stackId: stackIdentifier,
          parentBranch: branchData.parent,
          childBranch: branchData.name,
          position: i + 1
        });
      }
      
      return createdPrs;
    });

    return new Response(JSON.stringify({ success: true, createdPrs: result }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
};
