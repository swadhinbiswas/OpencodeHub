/**
 * Artifact Download/Delete API
 * GET    /api/repos/[owner]/[repo]/actions/runs/[runId]/artifacts/[name]  — download
 * DELETE /api/repos/[owner]/[repo]/actions/runs/[runId]/artifacts/[name]  — delete
 */

import { badRequest, notFound, unauthorized } from "@/lib/api";
import {
  deleteArtifact,
  downloadArtifact,
  listArtifacts,
} from "@/lib/artifacts";
import { getUserFromRequest } from "@/lib/auth";
import { withErrorHandler } from "@/lib/errors";
import type { APIRoute } from "astro";

export const GET: APIRoute = withErrorHandler(async ({ params, request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) return unauthorized();

  const { runId, name } = params;
  if (!runId || !name) return badRequest("Run ID and artifact name required");

  try {
    const { stream, artifact } = await downloadArtifact(runId, name);

    // Convert Node stream to web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });

    const contentType = artifact.mimeType || "application/octet-stream";

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(artifact.name)}"`,
        "X-Artifact-Size": String(artifact.sizeBytes),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Artifact not found";
    return notFound(message);
  }
});

export const DELETE: APIRoute = withErrorHandler(
  async ({ params, request }) => {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) return unauthorized();

    const { runId, name } = params;
    if (!runId || !name) return badRequest("Run ID and artifact name required");

    // Find the artifact by name to get its ID
    const artifacts = await listArtifacts(runId);
    const artifact = artifacts.find((a) => a.name === name);
    if (!artifact) return notFound("Artifact not found");

    await deleteArtifact(artifact.id);

    return new Response(null, { status: 204 });
  },
);
