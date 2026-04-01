import { getDatabase, schema } from "@/db";
import { badRequest, notFound, success, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { evaluateGates } from "@/lib/ci-gates";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

function inferGateType(gate: {
  gateName: string;
  details?: Record<string, unknown>;
}) {
  const detailsType =
    typeof gate?.details?.gateType === "string" ? gate.details.gateType : null;
  if (detailsType) return detailsType;
  if (gate.gateName.startsWith("Status:")) return "status_check";
  if (gate.gateName === "Review") return "review";
  if (gate.gateName === "Merge Conflicts") return "conflict";
  return "custom";
}

function buildRecommendations(
  failed: Array<{
    gateName: string;
    message: string;
    details?: Record<string, unknown>;
  }>,
) {
  const recommendations = new Set<string>();
  for (const gate of failed) {
    const gateType = inferGateType(gate);
    const message = gate.message.toLowerCase();

    if (gateType === "status_check") {
      recommendations.add("Re-run or fix failing required status checks.");
    }
    if (gateType === "review" || message.includes("approval")) {
      recommendations.add(
        "Request required approvals and resolve review feedback.",
      );
    }
    if (gateType === "label" || message.includes("label")) {
      recommendations.add("Apply required labels and remove blocked labels.");
    }
    if (gateType === "conflict") {
      recommendations.add(
        "Rebase or merge the base branch to resolve conflicts.",
      );
    }
    if (gateType === "custom") {
      recommendations.add(
        "Review custom merge gate configuration and conditions.",
      );
    }
  }

  return [...recommendations.values()];
}

async function resolveActor(
  db: NodePgDatabase<typeof schema>,
  request: Request,
  localUser: { id: string; isAdmin?: boolean | null } | null | undefined,
) {
  if (localUser?.id) {
    return localUser;
  }

  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return null;
  }

  return db.query.users.findFirst({
    where: eq(schema.users.id, tokenPayload.userId),
    columns: { id: true, isAdmin: true },
  });
}

export const GET: APIRoute = withErrorHandler(
  async ({ params, locals, request }) => {
    const owner = params.owner;
    const repoName = params.repo;
    const number = Number.parseInt(params.number || "", 10);

    if (!owner || !repoName || Number.isNaN(number)) {
      return badRequest("Missing or invalid parameters");
    }

    const db = getDatabase() as NodePgDatabase<typeof schema>;
    const actor = await resolveActor(db, request, locals.user);
    if (!actor) return unauthorized();

    const ownerUser = await db.query.users.findFirst({
      where: eq(schema.users.username, owner),
    });
    if (!ownerUser) return notFound("Repository not found");

    const repository = await db.query.repositories.findFirst({
      where: and(
        eq(schema.repositories.ownerId, ownerUser.id),
        eq(schema.repositories.name, repoName),
      ),
    });
    if (!repository) return notFound("Repository not found");

    if (
      !(await canReadRepo(actor.id, repository, {
        isAdmin: actor.isAdmin ?? undefined,
      }))
    ) {
      return notFound("Repository not found");
    }

    const pr = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.repositoryId, repository.id),
        eq(schema.pullRequests.number, number),
      ),
      columns: {
        id: true,
        number: true,
        state: true,
        isDraft: true,
        mergeable: true,
        mergeableState: true,
      },
    });
    if (!pr) return notFound("Pull request not found");

    if (pr.state !== "open") {
      return success({
        canMerge: false,
        blockers: ["Pull request is not open"],
        gateResults: [],
        mergeable: pr.mergeable,
        mergeableState: pr.mergeableState,
        policyReport: {
          totalGates: 0,
          failedGates: 0,
          passedGates: 0,
          failedByType: {},
          recommendations: [
            "Re-open the pull request before attempting to merge.",
          ],
        },
      });
    }

    const gateResult = await evaluateGates(pr.id);
    const failed = gateResult.results.filter((result) => !result.passed);
    const blockers = failed.map((result) => result.message);
    const failedByType = failed.reduce<Record<string, number>>((acc, gate) => {
      const gateType = inferGateType(gate as any);
      acc[gateType] = (acc[gateType] || 0) + 1;
      return acc;
    }, {});
    const recommendations = buildRecommendations(
      failed.map((gate) => ({
        gateName: gate.gateName,
        message: gate.message,
        details: gate.details,
      })),
    );

    return success({
      canMerge: gateResult.canMerge,
      blockers,
      gateResults: gateResult.results,
      mergeable: pr.mergeable,
      mergeableState: pr.mergeableState,
      policyReport: {
        totalGates: gateResult.results.length,
        failedGates: failed.length,
        passedGates: gateResult.results.length - failed.length,
        failedByType,
        recommendations,
      },
    });
  },
);
