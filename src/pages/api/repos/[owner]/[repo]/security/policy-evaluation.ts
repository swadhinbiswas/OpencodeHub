import type { APIRoute } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase, schema } from "@/db";
import { badRequest, forbidden, notFound, success, unauthorized } from "@/lib/api";
import { withErrorHandler } from "@/lib/errors";
import { canReadRepo } from "@/lib/permissions";
import {
  evaluateLicensePolicy,
  evaluateSecretPolicy,
  getRepositorySecurityPolicy,
} from "@/lib/security-policies";

function extractLicenseTypeFromDescription(description: string | null | undefined): string {
  if (!description) return "unknown";
  const match = description.match(/Category:\s*([^\n]+)/i);
  return match?.[1]?.trim()?.toLowerCase() || "unknown";
}

async function resolveRepo(ownerName: string, repoName: string) {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const owner = await db.query.users.findFirst({
    where: eq(schema.users.username, ownerName),
  });
  if (!owner) return null;

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(schema.repositories.ownerId, owner.id),
      eq(schema.repositories.name, repoName)
    ),
  });
  if (!repo) return null;

  return { db, repo };
}

export const GET: APIRoute = withErrorHandler(async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const ownerName = params.owner;
  const repoName = params.repo;
  if (!ownerName || !repoName) return badRequest("Missing repository parameters");

  const resolved = await resolveRepo(ownerName, repoName);
  if (!resolved?.repo) return notFound("Repository not found");
  if (!(await canReadRepo(user.id, resolved.repo))) return forbidden();

  const policy = await getRepositorySecurityPolicy(resolved.repo.id);

  const secretFindings = await resolved.db.query.secretScanResults.findMany({
    where: and(
      eq(schema.secretScanResults.repositoryId, resolved.repo.id),
      eq(schema.secretScanResults.status, "open")
    ),
    orderBy: [desc(schema.secretScanResults.createdAt)],
    limit: 200,
  });

  const latestScan = await resolved.db.query.securityScans.findFirst({
    where: eq(schema.securityScans.repositoryId, resolved.repo.id),
    orderBy: [desc(schema.securityScans.startedAt)],
    columns: { id: true },
  });

  const vulnerabilities = latestScan
    ? await resolved.db.query.securityVulnerabilities.findMany({
        where: eq(schema.securityVulnerabilities.scanId, latestScan.id),
        orderBy: [desc(schema.securityVulnerabilities.severity)],
      })
    : [];

  const secretViolations = secretFindings
    .map((finding) => ({
      ...finding,
      policy: evaluateSecretPolicy(policy, finding.secretType, finding.severity.toUpperCase()),
    }))
    .filter((item) => item.policy.violated);

  const licenseVulns = vulnerabilities.filter((vuln) => vuln.class === "license");
  const licenseViolations = licenseVulns
    .map((vuln) => ({
      ...vuln,
      policy: evaluateLicensePolicy(
        policy,
        extractLicenseTypeFromDescription(vuln.description),
        vuln.vulnerabilityId,
        vuln.title
      ),
    }))
    .filter((item) => item.policy.violated);

  const blockingViolations =
    policy.enforcementMode === "block" && policy.isEnabled
      ? secretViolations.length + licenseViolations.length
      : 0;

  return success({
    policy,
    summary: {
      secretOpenFindings: secretFindings.length,
      secretPolicyViolations: secretViolations.length,
      licenseFindings: licenseVulns.length,
      licensePolicyViolations: licenseViolations.length,
      blockingViolations,
      mergeBlocked: blockingViolations > 0,
    },
    secretViolations: secretViolations.slice(0, 50),
    licenseViolations: licenseViolations.slice(0, 50),
  });
});
