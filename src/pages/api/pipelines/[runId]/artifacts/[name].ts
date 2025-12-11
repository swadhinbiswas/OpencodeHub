import type { APIRoute } from "astro";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

const ARTIFACTS_DIR = path.join(process.cwd(), "artifacts");

export const GET: APIRoute = async ({ params }) => {
  const { runId, name } = params;
  if (!runId || !name) return new Response("Missing params", { status: 400 });

  const filePath = path.join(ARTIFACTS_DIR, runId, name);

  if (!fs.existsSync(filePath)) {
    return new Response("Artifact not found", { status: 404 });
  }

  const stat = await fs.promises.stat(filePath);
  const stream = fs.createReadStream(filePath);

  return new Response(Readable.toWeb(stream) as any, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": stat.size.toString(),
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
};
