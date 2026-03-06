/**
 * CSRF Token Endpoint
 * Returns a CSRF token and sets the corresponding cookie.
 * Frontend should call GET /api/auth/csrf-token before making state-changing requests,
 * then include the token as X-CSRF-Token header.
 */

import { getCsrfToken } from "@/middleware/csrf";
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
  const { token, cookie } = getCsrfToken(request);

  return new Response(JSON.stringify({ csrfToken: token }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
};
