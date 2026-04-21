import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { createStack } from "@/lib/stacks";
import { generateId } from "@/lib/utils";
import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

const SubmitStackSchema = z.object({
  branches: z.array(
    z.object({
      name: z.string(),
      parent: z.string(),
      commitHash: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      isDraft: z.boolean().default(false),
    }),
  ),
});

export const POST: APIRoute = async ({ params, request }) => {
  const { owner, repo } = params;
  if (!owner || !repo) return badRequest("Missing repo info");

  try {
    const actor = await getUserFromRequest(request);
    if (!actor) return unauthorized();

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const ownerUser = await db.query.users.findFirst({
      where: eq(schema.users.username, owner),
      columns: { id: true },
    });

    if (!ownerUser) return notFound("Repository owner not found");

    const repository = await db.query.repositories.findFirst({
      where: and(
        eq(schema.repositories.ownerId, ownerUser.id),
        eq(schema.repositories.name, repo),
      ),
    });

    if (!repository) return notFound("Repository not found");

    const body = await request.json();
    const parsed = SubmitStackSchema.parse(body);

    if (parsed.branches.length === 0) {
      return badRequest("At least one branch is required");
    }

    const dbPr = db;

    const latestPr = await dbPr
      .select({ number: schema.pullRequests.number })
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.repositoryId, repository.id))
      .orderBy(desc(schema.pullRequests.number))
      .limit(1);

    let nextNumber = (latestPr[0]?.number ?? 0) + 1;
    const stack = await createStack({
      repositoryId: repository.id,
      baseBranch: parsed.branches[0]?.parent || repository.defaultBranch,
      name: `Submitted stack (${parsed.branches.length} PRs)`,
      createdById: actor.userId,
    });

    const createdPrs: Array<{ prId: string; branch: string }> = [];

    await db.transaction(async (tx) => {
      for (let i = 0; i < parsed.branches.length; i++) {
        const branchData = parsed.branches[i];

        const existingPr = await tx.query.pullRequests.findFirst({
          where: and(
            eq(schema.pullRequests.repositoryId, repository.id),
            eq(schema.pullRequests.headBranch, branchData.name),
          ),
        });

        let prId = existingPr?.id;

        if (existingPr) {
          await tx
            .update(schema.pullRequests)
            .set({
              baseBranch: branchData.parent,
              headSha: branchData.commitHash,
              baseSha: branchData.commitHash,
              title: branchData.title || existingPr.title,
              body: branchData.description || existingPr.body,
              isDraft: branchData.isDraft,
              updatedAt: new Date(),
            })
            .where(eq(schema.pullRequests.id, existingPr.id));
        } else {
          const inserted = await tx
            .insert(schema.pullRequests)
            .values({
              id: generateId(),
              repositoryId: repository.id,
              number: nextNumber++,
              title: branchData.title || `Update ${branchData.name}`,
              body: branchData.description || "",
              state: "open",
              authorId: actor.userId,
              headBranch: branchData.name,
              headSha: branchData.commitHash,
              baseBranch: branchData.parent,
              baseSha: branchData.commitHash,
              isDraft: branchData.isDraft,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning({ id: schema.pullRequests.id });

          prId = inserted[0]?.id;
        }

        if (!prId) {
          throw new Error(
            `Failed to resolve pull request for branch ${branchData.name}`,
          );
        }

        await tx
          .delete(schema.prStackEntries)
          .where(eq(schema.prStackEntries.pullRequestId, prId));

        await tx.insert(schema.prStackEntries).values({
          id: generateId(),
          stackId: stack.id,
          pullRequestId: prId,
          stackOrder: i + 1,
          parentPrId: i > 0 ? (createdPrs[i - 1]?.prId ?? null) : null,
          createdAt: new Date(),
        });

        createdPrs.push({ prId, branch: branchData.name });
      }
    });

    return success({ success: true, stackId: stack.id, createdPrs });
  } catch (error: any) {
    return badRequest(error?.message || "Failed to submit stack");
  }
};
