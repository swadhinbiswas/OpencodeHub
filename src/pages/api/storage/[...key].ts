import { getStorage } from "@/lib/storage";
import { verifyStorageSignature } from "@/lib/storage-auth";
import type { APIRoute } from "astro";
import { Readable } from "stream";

export const GET: APIRoute = async ({ params, url }) => {
  const { key } = params;
  if (!key) return new Response("Missing key", { status: 400 });

  // Verify signature for secure access
  const signature = url.searchParams.get("sig");
  const expires = url.searchParams.get("exp");

  if (!verifyStorageSignature(key, signature, expires)) {
    return new Response("Unauthorized - Invalid or expired signature", { status: 401 });
  }

  const storage = await getStorage();

  try {
    const stream = await storage.getStream(key);
    const stat = await storage.stat(key);

    return new Response(Readable.toWeb(stream) as any, {
      headers: {
        "Content-Type": stat.contentType || "application/octet-stream",
        "Content-Length": stat.size.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return new Response("Not Found", { status: 404 });
  }
};
