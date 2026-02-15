
export const RATE_LIMITS = {
    // Authentication endpoints - stricter limits
    auth: {
        limit: parseInt(process.env.RATE_LIMIT_AUTH || "5"),
        windowMs: 15 * 60 * 1000, // 15 minutes
    },
    // API endpoints - moderate limits
    api: {
        limit: parseInt(process.env.RATE_LIMIT_API || "100"),
        windowMs: 60 * 1000, // 1 minute
    },
    // Git operations - higher limits
    git: {
        limit: parseInt(process.env.RATE_LIMIT_GIT || "200"),
        windowMs: 60 * 1000, // 1 minute
    },
    // General requests
    general: {
        limit: parseInt(process.env.RATE_LIMIT_GENERAL || "60"),
        windowMs: 60 * 1000, // 1 minute
    },
    // Login attempts - very strict
    login: {
        limit: parseInt(process.env.RATE_LIMIT_LOGIN || "5"),
        windowMs: 15 * 60 * 1000, // 15 minutes
    },
    // Password reset - prevent enumeration
    passwordReset: {
        limit: parseInt(process.env.RATE_LIMIT_PASSWORD_RESET || "3"),
        windowMs: 60 * 60 * 1000, // 1 hour
    },
};
