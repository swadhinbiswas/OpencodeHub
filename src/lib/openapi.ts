export const openApiSpec = {
    openapi: "3.0.0",
    info: {
        title: "OpenCodeHub API",
        version: "1.0.0",
        description: "API for OpenCodeHub - The open-source GitHub alternative.",
    },
    servers: [
        {
            url: "/api",
            description: "Local API",
        },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
            },
        },
        schemas: {
            Error: {
                type: "object",
                properties: {
                    success: { type: "boolean", example: false },
                    error: {
                        type: "object",
                        properties: {
                            code: { type: "string" },
                            message: { type: "string" },
                            details: { type: "object" },
                        },
                    },
                },
            },
            User: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    username: { type: "string" },
                    email: { type: "string", format: "email" },
                    displayName: { type: "string" },
                    avatarUrl: { type: "string" },
                    isAdmin: { type: "boolean" },
                },
            },
            Repo: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string" },
                    isPrivate: { type: "boolean" },
                    defaultBranch: { type: "string" },
                    createdAt: { type: "string", format: "date-time" },
                    owner: { $ref: "#/components/schemas/User" },
                },
            },
            ReviewSuggestion: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    line: { type: "integer", nullable: true },
                    endLine: { type: "integer", nullable: true },
                    severity: { type: "string", enum: ["info", "warning", "error", "critical"] },
                    type: { type: "string", enum: ["bug", "security", "performance", "style", "documentation", "suggestion"] },
                    title: { type: "string" },
                    message: { type: "string" },
                    suggestedFix: { type: "string", nullable: true },
                    explanation: { type: "string", nullable: true },
                },
            },
            AIBatchReviewRequest: {
                type: "object",
                properties: {
                    state: { type: "string", enum: ["APPROVED", "CHANGES_REQUESTED", "COMMENTED"], default: "COMMENTED" },
                    body: { type: "string" },
                    commitSha: { type: "string" },
                    comments: {
                        type: "array",
                        minItems: 1,
                        items: {
                            type: "object",
                            properties: {
                                body: { type: "string" },
                                path: { type: "string" },
                                line: { type: "integer" },
                                side: { type: "string", enum: ["LEFT", "RIGHT"] },
                                startLine: { type: "integer" },
                                commitSha: { type: "string" },
                                inReplyToId: { type: "string" },
                                suggestedChange: { type: "string" },
                            },
                            required: ["body"],
                        },
                    },
                },
                required: ["comments"],
            },
            AIReviewCallbackRequest: {
                type: "object",
                properties: {
                    reviewId: { type: "string" },
                    status: { type: "string", enum: ["completed", "failed"], default: "completed" },
                    summary: { type: "string" },
                    overallSeverity: { type: "string", enum: ["info", "warning", "error", "critical"] },
                    suggestions: {
                        type: "array",
                        items: { $ref: "#/components/schemas/ReviewSuggestion" },
                    },
                    usage: {
                        type: "object",
                        properties: {
                            inputTokens: { type: "integer" },
                            outputTokens: { type: "integer" },
                            totalTokens: { type: "integer" },
                        },
                    },
                    errorMessage: { type: "string" },
                    rawResponse: { type: "object" },
                },
                required: ["reviewId"],
            },
        },
    },
    paths: {
        "/auth/login": {
            post: {
                tags: ["Auth"],
                summary: "Login",
                description: "Authenticate user and get JWT.",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    login: { type: "string", description: "Username or Email" },
                                    password: { type: "string" },
                                    totpCode: { type: "string", description: "2FA Code (if enabled)" },
                                },
                                required: ["login", "password"],
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: "Successful login",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        success: { type: "boolean", example: true },
                                        data: {
                                            type: "object",
                                            properties: {
                                                user: { $ref: "#/components/schemas/User" },
                                                token: { type: "string" },
                                                expiresAt: { type: "string", format: "date-time" },
                                                requiresTwoFactor: { type: "boolean" },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    401: {
                        description: "Unauthorized",
                        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
                    },
                },
            },
        },
        "/auth/register": {
            post: {
                tags: ["Auth"],
                summary: "Register",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    username: { type: "string" },
                                    email: { type: "string", format: "email" },
                                    password: { type: "string", minLength: 8 },
                                },
                                required: ["username", "email", "password"],
                            },
                        },
                    },
                },
                responses: {
                    201: {
                        description: "User created",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        success: { type: "boolean", example: true },
                                        data: {
                                            type: "object",
                                            properties: {
                                                user: { $ref: "#/components/schemas/User" },
                                                token: { type: "string" },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        "/auth/me": {
            get: {
                tags: ["Auth"],
                summary: "Get Current User",
                security: [{ bearerAuth: [] }],
                responses: {
                    200: {
                        description: "Current user data",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        success: { type: "boolean", example: true },
                                        data: { $ref: "#/components/schemas/User" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        "/repos/{owner}/{repo}": {
            get: {
                tags: ["Repositories"],
                summary: "Get Repository",
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: {
                        description: "Repository details",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        success: { type: "boolean", example: true },
                                        data: { $ref: "#/components/schemas/Repo" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/reviews/batch": {
            post: {
                tags: ["Pull Requests"],
                summary: "Submit batch review with comments",
                description: "Atomically submit a PR review and multiple review comments in one request.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/AIBatchReviewRequest" },
                        },
                    },
                },
                responses: {
                    200: {
                        description: "Batch review submitted",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        success: { type: "boolean", example: true },
                                        data: {
                                            type: "object",
                                            properties: {
                                                id: { type: "string" },
                                                state: { type: "string" },
                                                commentCount: { type: "integer" },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/ai-review/callback": {
            post: {
                tags: ["AI Review"],
                summary: "Receive external AI agent callback",
                description: "Authenticated callback endpoint for external agents (CodeRabbit-like) to finalize async AI reviews.",
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/AIReviewCallbackRequest" },
                        },
                    },
                },
                responses: {
                    200: {
                        description: "Callback processed",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        success: { type: "boolean", example: true },
                                        data: {
                                            type: "object",
                                            properties: {
                                                reviewId: { type: "string" },
                                                status: { type: "string" },
                                                suggestionsCount: { type: "integer" },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    401: { description: "Unauthorized callback", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Review target not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/user/ai-config": {
            get: {
                tags: ["AI Review"],
                summary: "Get current user's AI config",
                security: [{ bearerAuth: [] }],
                responses: {
                    200: { description: "AI config returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["AI Review"],
                summary: "Update current user's AI config",
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    provider: {
                                        type: "string",
                                        enum: ["openai", "anthropic", "groq", "bytez", "openrouter", "together", "google", "external_agent", "local"],
                                    },
                                    model: { type: "string" },
                                    externalAgentWebhookUrl: { type: "string", format: "uri" },
                                    apiKeys: {
                                        type: "object",
                                        properties: {
                                            openai: { type: "string" },
                                            anthropic: { type: "string" },
                                            groq: { type: "string" },
                                            bytez: { type: "string" },
                                            openrouter: { type: "string" },
                                            together: { type: "string" },
                                            google: { type: "string" },
                                            externalAgent: { type: "string" },
                                        },
                                    },
                                },
                                required: ["provider"],
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "AI config updated" },
                    400: { description: "Invalid provider or payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
    },
};
