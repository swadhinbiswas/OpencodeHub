/**
 * Artifacts API - List and upload artifacts for a workflow run
 * GET  /api/repos/[owner]/[repo]/actions/runs/[runId]/artifacts  — list artifacts
 * POST /api/repos/[owner]/[repo]/actions/runs/[runId]/artifacts  — upload artifact
 */

import { badRequest, success, unauthorized } from "@/lib/api";
import { listArtifacts, uploadArtifact } from "@/lib/artifacts";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import type { APIRoute } from "astro";

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) return unauthorized();

  const { runId } = params;
  if (!runId) return badRequest("Run ID required");

  const artifacts = await listArtifacts(runId);
  return success({ artifacts });
});

export const POST: APIRoute = withErrorHandler(async ({ params, request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) return unauthorized();

  const { runId } = params;
  if (!runId) return badRequest("Run ID required");

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const { name, sourcePath, jobId, mimeType, retentionDays } = body;
  if (!name || !sourcePath) {
    return badRequest("name and sourcePath are required");
  }

  const artifact = await uploadArtifact({
    runId,
    jobId,
    name,
    sourcePath,
    mimeType,
    retentionDays,
  });

  return success({ artifact });
});
