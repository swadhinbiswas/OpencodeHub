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
    },
};
