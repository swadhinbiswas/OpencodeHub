import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canAdminRepo, canReadRepo } from "@/lib/permissions";
import { addRequiredCheck, createMergeGate, evaluateGates, getMergeGates } from "@/lib/ci-gates";

const createPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("required_check"),
    branch: z.string().min(1),
    checkName: z.string().min(1),
    strictMode: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("merge_gate"),
    name: z.string().min(1),
    description: z.string().optional(),
    gateType: z.enum(["status_check", "review", "label", "custom"]),
    config: z.record(z.string(), z.unknown()).optional(),
    conditionScript: z.string().optional(),
  }),
]);

async function resolveRepository(owner: string, repoName: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const ownerUser = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!ownerUser) return null;
  return db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, ownerUser.id),
      eq(schema.repositories.name, repoName)
    ),
  });
}

export const GET: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repoName) return badRequest("Missing parameters");

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canReadRepo(user.id, repository, { isAdmin: user.isAdmin }))) {
    return notFound("Repository not found");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const requiredChecks = await db.query.requiredStatusChecks.findMany({
    where: eq(schema.requiredStatusChecks.repositoryId, repository.id),
  });
  const mergeGates = await getMergeGates(repository.id);
  const search = new URL(request.url).searchParams;
  const pullNumberRaw = search.get("pullNumber");

  const requiredChecksByBranch = requiredChecks.reduce<Record<string, number>>((acc, check) => {
    acc[check.branch] = (acc[check.branch] || 0) + 1;
    return acc;
  }, {});
  const gateTypeBreakdown = mergeGates.reduce<Record<string, number>>((acc, gate) => {
    acc[gate.gateType] = (acc[gate.gateType] || 0) + 1;
    return acc;
  }, {});
  const duplicateCheckKeys = new Set<string>();
  const seenCheckKeys = new Set<string>();
  for (const check of requiredChecks) {
    const key = `${check.branch}::${check.checkName}`;
    if (seenCheckKeys.has(key)) duplicateCheckKeys.add(key);
    seenCheckKeys.add(key);
  }
  const warnings: Array<{ code: string; severity: "warning" | "info"; message: string }> = [];
  if (duplicateCheckKeys.size > 0) {
    warnings.push({
      code: "duplicate_required_checks",
      severity: "warning",
      message: `Duplicate required checks detected: ${[...duplicateCheckKeys.values()].join(", ")}`,
    });
  }
  const customWithoutScript = mergeGates.filter(
    (gate) => gate.gateType === "custom" && !gate.conditionScript
  );
  if (customWithoutScript.length > 0) {
    warnings.push({
      code: "custom_gate_without_script",
      severity: "info",
      message: `Custom gates without condition scripts: ${customWithoutScript.map((gate) => gate.name).join(", ")}`,
    });
  }

  let readiness: Awaited<ReturnType<typeof evaluateGates>> | null = null;
  let readinessReport:
    | {
        failedGateCount: number;
        failedGateNames: string[];
        recommendations: string[];
      }
    | null = null;
  if (pullNumberRaw !== null) {
    const pullNumber = Number.parseInt(pullNumberRaw, 10);
    if (!Number.isFinite(pullNumber) || pullNumber < 1) {
      return badRequest("Invalid pullNumber query parameter");
    }
    const pullRequest = await db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.repositoryId, repository.id),
        eq(schema.pullRequests.number, pullNumber)
      ),
    });
    if (!pullRequest) return notFound("Pull request not found");
    readiness = await evaluateGates(pullRequest.id);
    const failed = readiness.results.filter((result) => !result.passed);
    const recommendations = new Set<string>();
    for (const gate of failed) {
      if (gate.gateName.startsWith("Status: ")) {
        recommendations.add("Re-run or fix failing required status checks.");
      }
      if (gate.gateName === "Review" || gate.message.toLowerCase().includes("approval")) {
        recommendations.add("Request approvals from required reviewers and resolve outstanding review changes.");
      }
      if (gate.message.toLowerCase().includes("label")) {
        recommendations.add("Add required labels and remove blocked labels before merging.");
      }
      if (gate.gateName === "Merge Conflicts") {
        recommendations.add("Rebase or merge base branch to resolve merge conflicts.");
      }
    }
    readinessReport = {
      failedGateCount: failed.length,
      failedGateNames: failed.map((gate) => gate.gateName),
      recommendations: [...recommendations.values()],
    };
  }

  return success({
    requiredChecks,
    mergeGates,
    report: {
      requiredChecksTotal: requiredChecks.length,
      mergeGatesTotal: mergeGates.length,
      enabledMergeGates: mergeGates.filter((gate) => gate.isEnabled).length,
      disabledMergeGates: mergeGates.filter((gate) => !gate.isEnabled).length,
      requiredChecksByBranch,
      gateTypeBreakdown,
      warnings,
    },
    readiness,
    readinessReport,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const user = locals.user;

  if (!user) return unauthorized();
  if (!owner || !repoName) return badRequest("Missing parameters");

  const repository = await resolveRepository(owner, repoName);
  if (!repository) return notFound("Repository not found");

  if (!(await canAdminRepo(user.id, repository, { isAdmin: user.isAdmin }))) {
    return forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = createPayloadSchema.safeParse(body || {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || "Invalid merge gate payload");
  }

  if (parsed.data.kind === "required_check") {
    const check = await addRequiredCheck({
      repositoryId: repository.id,
      branch: parsed.data.branch,
      checkName: parsed.data.checkName,
      strictMode: parsed.data.strictMode,
    });
    return success({ kind: "required_check", check });
  }

  const gate = await createMergeGate({
    repositoryId: repository.id,
    name: parsed.data.name,
    description: parsed.data.description,
    gateType: parsed.data.gateType,
    config: parsed.data.config,
    conditionScript: parsed.data.conditionScript,
  });
  return success({ kind: "merge_gate", gate });
});
