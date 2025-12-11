import { getStorage } from "@/lib/storage";
import type { APIRoute } from "astro";
import { Readable } from "stream";

export const GET: APIRoute = async ({ params, request }) => {
  const { key } = params;
  if (!key) return new Response("Missing key", { status: 400 });

  const storage = getStorage();

  // TODO: Verify signature if we want to secure local storage access
  // For now, assuming internal or public access for simplicity,
  // OR we rely on the fact that the key is hard to guess (if it's a hash).
  // But for LFS, OIDs are known.

  try {
    const stream = await storage.getStream(key);
    const stat = await storage.stat(key);

    return new Response(Readable.toWeb(stream) as any, {
      headers: {
        "Content-Type": stat.contentType || "application/octet-stream",
        "Content-Length": stat.size.toString(),
      },
    });
  } catch (e) {
    return new Response("Not Found", { status: 404 });
  }
};
