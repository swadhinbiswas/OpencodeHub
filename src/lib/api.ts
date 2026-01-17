/**
 * API Response helpers
 */

import { z } from "zod";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    perPage?: number;
    total?: number;
    totalPages?: number;
  };
}

export function success<T>(data: T, meta?: ApiResponse["meta"]): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
    ...(meta && { meta }),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function created<T>(data: T): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
  };

  return new Response(JSON.stringify(body), {
    status: 201,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function noContent(): Response {
  return new Response(null, {
    status: 204,
  });
}

export function error(
  code: string,
  message: string,
  status = 400,
  details?: unknown
): Response {
  const body: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(typeof details === 'object' && details ? { details } : {}),
    },
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function badRequest(message: string, details?: unknown): Response {
  return error("BAD_REQUEST", message, 400, details);
}

export function unauthorized(message = "Unauthorized"): Response {
  return error("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "Forbidden"): Response {
  return error("FORBIDDEN", message, 403);
}

export function notFound(message = "Resource not found"): Response {
  return error("NOT_FOUND", message, 404);
}

export function conflict(message: string): Response {
  return error("CONFLICT", message, 409);
}

export function validationError(errors: z.ZodError): Response {
  const details = errors.errors.map((err) => ({
    field: err.path.join("."),
    message: err.message,
  }));

  return error("VALIDATION_ERROR", "Validation failed", 400, details);
}

export function serverError(message = "Internal server error"): Response {
  return error("SERVER_ERROR", message, 500);
}

export function rateLimited(retryAfter?: number): Response {
  const response = error("RATE_LIMITED", "Too many requests", 429);
  if (retryAfter) {
    response.headers.set("Retry-After", String(retryAfter));
  }
  return response;
}

/**
 * Parse JSON body from request
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ data: T } | { error: Response }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return { error: validationError(result.error) };
    }

    return { data: result.data };
  } catch (e) {
    return { error: badRequest("Invalid JSON body") };
  }
}

/**
 * Parse query parameters
 */
export function parseQuery<T>(
  url: URL,
  schema: z.ZodSchema<T>
): { data: T } | { error: Response } {
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const result = schema.safeParse(params);

  if (!result.success) {
    return { error: validationError(result.error) };
  }

  return { data: result.data };
}

/**
 * Pagination helpers
 */
export interface PaginationParams {
  page: number;
  perPage: number;
  offset: number;
}

export function getPagination(
  url: URL,
  defaultPerPage = 20,
  maxPerPage = 100
): PaginationParams {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const perPage = Math.min(
    maxPerPage,
    Math.max(
      1,
      parseInt(url.searchParams.get("per_page") || String(defaultPerPage), 10)
    )
  );

  return {
    page,
    perPage,
    offset: (page - 1) * perPage,
  };
}

export function paginationMeta(
  total: number,
  pagination: PaginationParams
): ApiResponse["meta"] {
  return {
    page: pagination.page,
    perPage: pagination.perPage,
    total,
    totalPages: Math.ceil(total / pagination.perPage),
  };
}
