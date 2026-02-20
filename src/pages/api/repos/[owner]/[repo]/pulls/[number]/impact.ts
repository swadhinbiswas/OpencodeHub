import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo, canWriteRepo } from "@/lib/permissions";
import { compareBranches } from "@/lib/git";
import { resolveRepoPath } from "@/lib/git-storage";
import { checkPathPermissions } from "@/lib/path-scoping";
import {
  analyzeImpact,
  detectAPIChangesForPullRequest,
  detectBreakingChanges,
  detectMigrations,
} from "@/lib/dependency-awareness";
import { detectIaCFiles, triggerIaCHooks } from "@/lib/iac-hooks";
import type { BreakingChange, MigrationDetection, APIChangeDetection } from "@/lib/dependency-awareness";

const scanSchema = z.object({
  persist: z.boolean().optional().default(true),
  runIaCHooks: z.boolean().optional().default(false),
  iacAction: z.enum(["plan", "apply"]).optional().default("plan"),
  iacRunId: z.string().optional(),
});

async function resolveRepoAndPr(owner: string, repoName: string, number: number) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const repoOwner = await db.query.users.findFirst({
    where: eq(schema.users.username, owner),
  });
  if (!repoOwner) return null;
  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, repoOwner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repository) return null;
  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(schema.pullRequests.repositoryId, repository.id),
      eq(schema.pullRequests.number, number)
    ),
  });
  if (!pr) return null;
  return { repository, pr };
}

function filterImpactByReadablePaths(options: {
  userId: string;
  repositoryId: string;
  breakingChanges: BreakingChange[];
  migrations: MigrationDetection[];
  apiChanges: APIChangeDetection[];
}) {
  return (async () => {
    const scopedPaths = Array.from(
      new Set([
        ...options.breakingChanges.flatMap((change) => change.affectedFiles || []),
        ...options.migrations.flatMap((migration) => migration.files || []),
        ...options.apiChanges.flatMap((change) => change.affectedFiles || []),
      ])
    );
    if (scopedPaths.length === 0) {
      return {
        breakingChanges: options.breakingChanges,
        migrations: options.migrations,
        apiChanges: options.apiChanges,
        hiddenPathArtifacts: 0,
      };
    }

    const permission = await checkPathPermissions(
      options.userId,
      options.repositoryId,
      scopedPaths,
      "read"
    );
    const denied = new Set(permission.deniedPaths || []);
    let hiddenPathArtifacts = 0;

    const breakingChanges = options.breakingChanges.map((change) => {
      const visible = (change.affectedFiles || []).filter((file) => !denied.has(file));
      hiddenPathArtifacts += (change.affectedFiles || []).length - visible.length;
      return {
        ...change,
        affectedFiles: visible,
      };
    });

    const migrations = options.migrations.map((migration) => {
      const visible = (migration.files || []).filter((file) => !denied.has(file));
      hiddenPathArtifacts += (migration.files || []).length - visible.length;
      return {
        ...migration,
        files: visible,
      };
    });
    const apiChanges = options.apiChanges.map((change) => {
      const visible = (change.affectedFiles || []).filter((file) => !denied.has(file));
      hiddenPathArtifacts += (change.affectedFiles || []).length - visible.length;
      return {
        ...change,
        affectedFiles: visible,
      };
    });

    return {
      breakingChanges,
      migrations,
      apiChanges,
      hiddenPathArtifacts,
    };
  })();
}

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const number = Number(params.number);
  if (!owner || !repoName || Number.isNaN(number)) return badRequest("Invalid route parameters");

  const resolved = await resolveRepoAndPr(owner, repoName, number);
  if (!resolved) return notFound("Pull request not found");

  if (!(await canReadRepo(locals.user?.id, resolved.repository, { isAdmin: locals.user?.isAdmin }))) {
    return notFound("Pull request not found");
  }

  const impact = await analyzeImpact(resolved.pr.id);
  const filtered = await filterImpactByReadablePaths({
    userId: locals.user?.id || "__anonymous__",
    repositoryId: resolved.repository.id,
    breakingChanges: impact.breakingChanges,
    migrations: impact.migrations,
    apiChanges: impact.apiChanges,
  });

  return success({
    ...impact,
    breakingChanges: filtered.breakingChanges,
    migrations: filtered.migrations,
    apiChanges: filtered.apiChanges,
    hiddenPathArtifacts: filtered.hiddenPathArtifacts,
  });
});

export const POST: APIRoute = withErrorHandler(async ({ params, locals, request }) => {
  const owner = params.owner;
  const repoName = params.repo;
  const number = Number(params.number);
  if (!owner || !repoName || Number.isNaN(number)) return badRequest("Invalid route parameters");
  if (!locals.user) return unauthorized();

  const parsed = await parseBody(request, scanSchema);
  if ("error" in parsed) return parsed.error;

  const resolved = await resolveRepoAndPr(owner, repoName, number);
  if (!resolved) return notFound("Pull request not found");
  if (!(await canWriteRepo(locals.user.id, resolved.repository, { isAdmin: locals.user.isAdmin }))) {
    return forbidden();
  }

  const repoPath = await resolveRepoPath(resolved.repository.diskPath);
  const { diffs } = await compareBranches(repoPath, resolved.pr.baseBranch, resolved.pr.headBranch);
  const changedFiles = diffs.map((d) => d.file).filter(Boolean);

  if (changedFiles.length > 0) {
    const permission = await checkPathPermissions(
      locals.user.id,
      resolved.repository.id,
      changedFiles,
      "write"
    );
    if (!permission.allowed) {
      return forbidden(permission.reason || "Insufficient path permissions for one or more changed files");
    }
  }

  const breaking = await detectBreakingChanges(resolved.pr.id);
  const migrations = await detectMigrations(resolved.pr.id, changedFiles);
  const apiChanges = await detectAPIChangesForPullRequest(resolved.pr.id, changedFiles);
  const impact = await analyzeImpact(resolved.pr.id);
  const iacFiles = detectIaCFiles(changedFiles);
  const iacHookResults =
    parsed.data.runIaCHooks && iacFiles.length > 0
      ? await triggerIaCHooks({
          repositoryId: resolved.repository.id,
          action: parsed.data.iacAction ?? "plan",
          runId: parsed.data.iacRunId,
          message: `Triggered from PR #${resolved.pr.number} impact scan`,
        })
      : [];

  return success({
    breakingDetected: breaking.length,
    migrationsDetected: migrations.length,
    apiChangesDetected: apiChanges.length,
    iacFilesDetected: iacFiles.length,
    iacHookRuns: iacHookResults,
    impact,
    persisted: parsed.data.persist,
  });
});
