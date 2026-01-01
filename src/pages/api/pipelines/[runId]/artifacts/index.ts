import { verifyRunnerToken } from "@/lib/runner-auth";
import type { APIRoute } from "astro";
import fs from "fs/promises";
import path from "path";

const ARTIFACTS_DIR = path.join(process.cwd(), "data", "artifacts");

export const GET: APIRoute = async ({ params, locals }) => {
  const { runId } = params;
  if (!runId) return new Response("Missing runId", { status: 400 });

  // Authenticated users or runners can access artifacts
  const user = locals.user;
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const runDir = path.join(ARTIFACTS_DIR, runId);
  try {
    await fs.access(runDir);
  } catch {
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const files = await fs.readdir(runDir);
  const artifacts = await Promise.all(
    files.map(async (file) => {
      const stat = await fs.stat(path.join(runDir, file));
      return {
        name: file,
        size: stat.size,
        createdAt: stat.birthtime,
      };
    })
  );

  return new Response(JSON.stringify(artifacts), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ params, request }) => {
  const { runId } = params;
  if (!runId) return new Response("Missing runId", { status: 400 });

  // Validate runner auth token
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!verifyRunnerToken(token, runId)) {
    return new Response("Unauthorized - Invalid runner token", { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const name = (formData.get("name") as string) || file?.name;

  if (!file) return new Response("No file uploaded", { status: 400 });

  const runDir = path.join(ARTIFACTS_DIR, runId);
  await fs.mkdir(runDir, { recursive: true });

  const filePath = path.join(runDir, name);
  const buffer = await file.arrayBuffer();
  await fs.writeFile(filePath, Buffer.from(buffer));

  return new Response(JSON.stringify({ name, size: file.size }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
