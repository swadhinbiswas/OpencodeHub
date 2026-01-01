/**
 * Unified Error Handling
 * Standardized error types and handlers for consistent API responses
 */

import { logger } from "@/lib/logger";

// Error codes for API responses
export type ErrorCode =
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "BAD_REQUEST"
    | "VALIDATION_ERROR"
    | "CONFLICT"
    | "RATE_LIMITED"
    | "INTERNAL_ERROR"
    | "SERVICE_UNAVAILABLE"
    | "GIT_ERROR"
    | "DATABASE_ERROR";

// HTTP status codes mapping
const STATUS_CODES: Record<ErrorCode, number> = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    BAD_REQUEST: 400,
    VALIDATION_ERROR: 422,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
    GIT_ERROR: 500,
    DATABASE_ERROR: 500,
};

/**
 * Application Error class for consistent error handling
 */
export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly statusCode: number;
    public readonly details?: Record<string, unknown>;
    public readonly isOperational: boolean;

    constructor(
        code: ErrorCode,
        message: string,
        details?: Record<string, unknown>,
        isOperational = true
    ) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.statusCode = STATUS_CODES[code];
        this.details = details;
        this.isOperational = isOperational;

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Convert to JSON response format
     */
    toJSON() {
        return {
            error: {
                code: this.code,
                message: this.message,
                ...(this.details && { details: this.details }),
            },
        };
    }

    /**
     * Convert to Response object
     */
    toResponse(): Response {
        return new Response(JSON.stringify(this.toJSON()), {
            status: this.statusCode,
            headers: { "Content-Type": "application/json" },
        });
    }
}

// Convenience factory functions
export const Errors = {
    unauthorized: (message = "Authentication required") =>
        new AppError("UNAUTHORIZED", message),

    forbidden: (message = "Access denied") =>
        new AppError("FORBIDDEN", message),

    notFound: (resource = "Resource") =>
        new AppError("NOT_FOUND", `${resource} not found`),

    badRequest: (message: string, details?: Record<string, unknown>) =>
        new AppError("BAD_REQUEST", message, details),

    validation: (errors: Record<string, string[]>) =>
        new AppError("VALIDATION_ERROR", "Validation failed", { errors }),

    conflict: (message: string) =>
        new AppError("CONFLICT", message),

    rateLimited: (retryAfter?: number) =>
        new AppError("RATE_LIMITED", "Too many requests", { retryAfter }),

    internal: (message = "Internal server error") =>
        new AppError("INTERNAL_ERROR", message, undefined, false),

    gitError: (message: string, details?: Record<string, unknown>) =>
        new AppError("GIT_ERROR", message, details),

    dbError: (message = "Database error") =>
        new AppError("DATABASE_ERROR", message, undefined, false),
};

/**
 * Wrap async API handlers with error handling
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<Response>>(
    handler: T
): T {
    return (async (...args: Parameters<T>) => {
        try {
            return await handler(...args);
        } catch (error) {
            return handleError(error);
        }
    }) as T;
}

/**
 * Central error handler
 */
export function handleError(error: unknown): Response {
    // Known application error
    if (error instanceof AppError) {
        if (!error.isOperational) {
            logger.error({ err: error, code: error.code }, "Non-operational error");
        }
        return error.toResponse();
    }

    // Zod validation error
    if (error && typeof error === "object" && "issues" in error) {
        const zodError = error as { issues: Array<{ path: string[]; message: string }> };
        const errors: Record<string, string[]> = {};
        for (const issue of zodError.issues) {
            const path = issue.path.join(".");
            if (!errors[path]) errors[path] = [];
            errors[path].push(issue.message);
        }
        return Errors.validation(errors).toResponse();
    }

    // Unknown error - log and return generic message
    logger.error({ err: error }, "Unhandled error");
    return Errors.internal().toResponse();
}

/**
 * Assert condition or throw AppError
 */
export function assert(
    condition: unknown,
    error: AppError
): asserts condition {
    if (!condition) {
        throw error;
    }
}

/**
 * Assert user is authenticated
 */
export function assertAuthenticated(
    user: unknown
): asserts user is { id: string; username: string } {
    if (!user) {
        throw Errors.unauthorized();
    }
}

/**
 * Try-catch wrapper that converts errors to AppError
 */
export async function tryCatch<T>(
    fn: () => Promise<T>,
    errorFactory: (err: unknown) => AppError = () => Errors.internal()
): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        throw errorFactory(error);
    }
}
