import type { APIRoute } from "astro";
import { openApiSpec } from "@/lib/openapi";

export const GET: APIRoute = async () => {
    return new Response(JSON.stringify(openApiSpec), {
        headers: {
            "Content-Type": "application/json"
        }
    });
}
