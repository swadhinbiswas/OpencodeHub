import { getStorage } from "@/lib/storage";
import type { APIRoute } from "astro";

export const PUT: APIRoute = async ({ params, request }) => {
  const { key } = params;
  if (!key) return new Response("Missing key", { status: 400 });

  const storage = getStorage();

  // TODO: Verify signature

  if (!request.body) return new Response("Body required", { status: 400 });

  try {
    // We need to stream the request body to storage
    // StorageAdapter.put expects Buffer or Readable
    // request.body is ReadableStream (Web)

    // Convert Web ReadableStream to Node Readable
    const reader = request.body.getReader();
    const nodeReadable = new (require("stream").Readable)({
      async read() {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
        } else {
          this.push(Buffer.from(value));
        }
      },
    });

    await storage.put(key, nodeReadable);
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("Upload failed", { status: 500 });
  }
};
