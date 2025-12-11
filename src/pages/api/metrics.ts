import { register } from "@/lib/metrics";
import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  try {
    const metrics = await register.metrics();
    return new Response(metrics, {
      headers: {
        "Content-Type": register.contentType,
      },
    });
  } catch (err) {
    return new Response("Error retrieving metrics", { status: 500 });
  }
};
