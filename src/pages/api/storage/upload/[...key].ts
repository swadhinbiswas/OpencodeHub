import { getStorage } from "@/lib/storage";
import { verifyStorageSignature } from "@/lib/storage-auth";
import type { APIRoute } from "astro";
import { Readable } from "stream";

export const PUT: APIRoute = async ({ params, request, url }) => {
  const { key } = params;
  if (!key) return new Response("Missing key", { status: 400 });

  // Verify signature for secure access
  const signature = url.searchParams.get("sig");
  const expires = url.searchParams.get("exp");

  if (!verifyStorageSignature(key, signature, expires)) {
    return new Response("Unauthorized - Invalid or expired signature", { status: 401 });
  }

  // Removed duplicate storage declaration

  if (!request.body) return new Response("Body required", { status: 400 });

  try {
    // Convert Web ReadableStream to Node Readable
    const reader = request.body.getReader();
    const nodeReadable = new Readable({
      async read() {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
        } else {
          this.push(Buffer.from(value));
        }
      },
    });

    const storage = await getStorage();
    await storage.put(key, nodeReadable);
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("Upload failed", { status: 500 });
  }
};
