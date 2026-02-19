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
            SuggestionApplyRequest: {
                type: "object",
                properties: {
                    commentIds: {
                        type: "array",
                        minItems: 1,
                        maxItems: 50,
                        items: { type: "string" },
                    },
                },
                required: ["commentIds"],
            },
            StackApprovalRequest: {
                type: "object",
                properties: {
                    reviewers: {
                        type: "array",
                        minItems: 1,
                        maxItems: 50,
                        items: { type: "string", description: "Reviewer username" },
                    },
                },
                required: ["reviewers"],
            },
            StackMergeRequest: {
                type: "object",
                properties: {
                    mergeMethod: { type: "string", enum: ["merge", "squash", "rebase"] },
                    skipApprovalCheck: { type: "boolean" },
                },
            },
            PullRequestCommentCreateRequest: {
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
            PullRequestCommentUpdateRequest: {
                type: "object",
                properties: {
                    body: { type: "string" },
                },
                required: ["body"],
            },
            PullRequestReviewRequest: {
                type: "object",
                properties: {
                    state: { type: "string", enum: ["APPROVED", "CHANGES_REQUESTED", "COMMENTED"] },
                    body: { type: "string" },
                    commitSha: { type: "string" },
                    comments: {
                        type: "array",
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
                required: ["state"],
            },
            WorkflowStateCreateRequest: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                },
                required: ["name"],
            },
            PRDependencyGraphResponse: {
                type: "object",
                properties: {
                    repositoryId: { type: "string" },
                    includeFiles: { type: "boolean" },
                    graph: {
                        type: "object",
                        properties: {
                            nodes: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        prId: { type: "string" },
                                        prNumber: { type: "integer" },
                                        title: { type: "string" },
                                        dependsOn: { type: "array", items: { type: "string" } },
                                        blockedBy: { type: "array", items: { type: "string" } },
                                        dependencyType: { type: "string", enum: ["branch", "files", "manual"] },
                                    },
                                },
                            },
                            edges: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        from: { type: "string" },
                                        to: { type: "string" },
                                        type: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            StackOrderSuggestionRequest: {
                type: "object",
                properties: {
                    prIds: {
                        type: "array",
                        minItems: 2,
                        maxItems: 100,
                        items: { type: "string" },
                    },
                },
                required: ["prIds"],
            },
            PullRequestBulkMergeRequest: {
                type: "object",
                properties: {
                    prIds: {
                        type: "array",
                        minItems: 1,
                        maxItems: 100,
                        items: { type: "string" },
                    },
                    mergeMethod: {
                        type: "string",
                        enum: ["merge", "squash", "rebase"],
                    },
                },
                required: ["prIds"],
            },
            MirrorConfigRequest: {
                type: "object",
                properties: {
                    mirrorUrl: { type: "string", format: "uri" },
                },
                required: ["mirrorUrl"],
            },
            UserDigestTestRequest: {
                type: "object",
                properties: {
                    dryRun: { type: "boolean", default: true },
                    period: { type: "string", enum: ["daily", "weekly"] },
                    maxRetries: { type: "integer", minimum: 0, maximum: 5, default: 1 },
                },
            },
            UserEmailTestRequest: {
                type: "object",
                properties: {
                    dryRun: { type: "boolean", default: true },
                    to: { type: "string", format: "email" },
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
                    {
                        name: "x-opencodehub-timestamp",
                        in: "header",
                        required: false,
                        schema: { type: "string" },
                        description: "Unix timestamp (seconds or milliseconds) for signed callbacks.",
                    },
                    {
                        name: "x-opencodehub-signature",
                        in: "header",
                        required: false,
                        schema: { type: "string" },
                        description: "HMAC signature in format sha256=<hex> over '<timestamp>.<rawBody>'.",
                    },
                    {
                        name: "x-opencodehub-event-id",
                        in: "header",
                        required: false,
                        schema: { type: "string" },
                        description: "Unique event id used for replay protection.",
                    },
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
        "/repos/{owner}/{repo}/pulls/{number}/suggestions/apply": {
            post: {
                tags: ["Pull Requests"],
                summary: "Apply one or more review suggestions",
                description: "Applies suggestion comments to the PR branch after repository and path-scoped permission checks.",
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
                            schema: { $ref: "#/components/schemas/SuggestionApplyRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "Suggestion(s) applied" },
                    400: { description: "Invalid comment ids or payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/stacks/{stackId}/approvals": {
            get: {
                tags: ["Stacks"],
                summary: "Get stack approval status",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "stackId", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Stack approval status returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or stack not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["Stacks"],
                summary: "Request approvals across all PRs in a stack",
                description: "Requests stack approvals for eligible reviewers. Reviewers without repository access are skipped.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "stackId", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/StackApprovalRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "Approval requests created for eligible reviewers" },
                    400: { description: "Invalid payload or no eligible reviewers", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or stack not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/stacks/{stackId}/merge-readiness": {
            get: {
                tags: ["Stacks"],
                summary: "Get stack merge readiness",
                description: "Returns whether the full stack can be merged now, including blocking approval reasons.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "stackId", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Merge readiness returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or stack not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/stacks/{stackId}/merge": {
            post: {
                tags: ["Stacks"],
                summary: "Queue merge for all PRs in a stack",
                description: "Attempts to merge an entire stack in order by enqueuing each eligible PR into the merge queue. `skipApprovalCheck` requires repository admin privileges.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "stackId", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: false,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/StackMergeRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "Bulk merge result returned" },
                    400: { description: "Invalid merge payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or stack not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/stacks/{stackId}/auto-update": {
            post: {
                tags: ["Stacks"],
                summary: "Auto-update stack onto latest base branch",
                description: "Checks whether a stack is behind and triggers stack auto-update/rebase when needed.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "stackId", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Auto-update result returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or stack not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/comments": {
            get: {
                tags: ["Pull Requests"],
                summary: "List PR comments",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Comments returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["Pull Requests"],
                summary: "Create PR comment",
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
                            schema: { $ref: "#/components/schemas/PullRequestCommentCreateRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "Comment created" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            patch: {
                tags: ["Pull Requests"],
                summary: "Update PR comment",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                    { name: "commentId", in: "query", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/PullRequestCommentUpdateRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "Comment updated" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Comment or repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            delete: {
                tags: ["Pull Requests"],
                summary: "Delete PR comment",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                    { name: "commentId", in: "query", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Comment deleted" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Comment or repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/reviews": {
            post: {
                tags: ["Pull Requests"],
                summary: "Submit pull request review",
                description: "Submit a review state and optional inline comments with path-scoped permission enforcement.",
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
                            schema: { $ref: "#/components/schemas/PullRequestReviewRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "Review submitted" },
                    400: { description: "Invalid review payload or state", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/dependencies": {
            get: {
                tags: ["Pull Requests"],
                summary: "Get automatic cross-PR dependency graph",
                description: "Returns branch and optional file-overlap dependency graph for open pull requests in a repository.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    {
                        name: "includeFiles",
                        in: "query",
                        required: false,
                        schema: { type: "boolean", default: true },
                        description: "Set false to return branch-based dependencies only.",
                    },
                ],
                responses: {
                    200: {
                        description: "Dependency graph returned",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        success: { type: "boolean", example: true },
                                        data: { $ref: "#/components/schemas/PRDependencyGraphResponse" },
                                    },
                                },
                            },
                        },
                    },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/stack-order": {
            post: {
                tags: ["Pull Requests"],
                summary: "Suggest stack ordering for selected PRs",
                description: "Returns topological stack order and dependency cycles for a set of repository PR IDs.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/StackOrderSuggestionRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "Suggested order returned" },
                    400: { description: "Invalid PR list or cross-repository IDs", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/settings/mirror": {
            get: {
                tags: ["Repositories"],
                summary: "Get repository mirror settings",
                description: "Returns mirror configuration and derived health fields (`isHealthy`, `isStale`, `lastSyncAgeMinutes`).",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Mirror settings returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["Repositories"],
                summary: "Configure repository mirror",
                description: "Configures upstream mirror URL and performs initial synchronization.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/MirrorConfigRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "Mirror configured" },
                    400: { description: "Invalid mirror URL or sync failure", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            delete: {
                tags: ["Repositories"],
                summary: "Disable repository mirror",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Mirror disabled" },
                    400: { description: "Disable failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/settings/mirror/sync": {
            post: {
                tags: ["Repositories"],
                summary: "Trigger manual mirror sync",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Sync completed" },
                    400: { description: "Sync failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/external-ci": {
            get: {
                tags: ["CI/CD"],
                summary: "Get external CI integration status",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "External CI integration status returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["CI/CD"],
                summary: "Configure or rotate external CI integration token",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: false,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string", default: "External CI" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: "Token generated and integration configured" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            delete: {
                tags: ["CI/CD"],
                summary: "Disable external CI integration",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Integration disabled" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/user/notification-digests/test": {
            post: {
                tags: ["Notifications"],
                summary: "Run a user digest test",
                description: "Runs a digest generation for the authenticated user. Defaults to dry-run mode unless explicitly disabled.",
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: false,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UserDigestTestRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "Digest test result returned" },
                    400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/user/email/test": {
            post: {
                tags: ["Notifications"],
                summary: "Run a user email delivery test",
                description: "Sends (or dry-runs) a simple test email for the authenticated user to verify delivery setup.",
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: false,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UserEmailTestRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "Email test result returned" },
                    400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/cron/notification-digests": {
            post: {
                tags: ["Notifications"],
                summary: "Run scheduled digest delivery",
                description: "Cron-authenticated endpoint to process due digests. Supports `dryRun=true` and bounded retry depth via `maxRetries`.",
                parameters: [
                    {
                        name: "dryRun",
                        in: "query",
                        required: false,
                        schema: { type: "boolean", default: false },
                    },
                    {
                        name: "maxRetries",
                        in: "query",
                        required: false,
                        schema: { type: "integer", minimum: 0, maximum: 5, default: 1 },
                    },
                ],
                responses: {
                    200: { description: "Digest run completed" },
                    401: { description: "Unauthorized" },
                    500: { description: "Digest run failed" },
                },
            },
        },
        "/notifications": {
            get: {
                tags: ["Notifications"],
                summary: "List notifications",
                description: "Returns notifications for the authenticated user. Supports `filter=unread|read|archived|all|blocking` and `prioritize=true` for smart priority ordering.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        name: "filter",
                        in: "query",
                        required: false,
                        schema: {
                            type: "string",
                            enum: ["unread", "read", "archived", "all", "blocking"],
                        },
                    },
                    {
                        name: "prioritize",
                        in: "query",
                        required: false,
                        schema: { type: "boolean" },
                    },
                ],
                responses: {
                    200: { description: "Notifications returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    500: { description: "Fetch failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/notifications/blocking/summary": {
            get: {
                tags: ["Notifications"],
                summary: "Get blocking notification summary",
                description: "Returns aggregate blocking-alert counts and top prioritized recent blocking notifications for the authenticated user.",
                security: [{ bearerAuth: [] }],
                responses: {
                    200: { description: "Blocking summary returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    500: { description: "Summary load failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/templates": {
            get: {
                tags: ["Repositories"],
                summary: "List repository templates",
                description: "Returns template repositories visible to the caller. Supports `q`, `owner`, and `visibility` filters.",
                parameters: [
                    { name: "q", in: "query", required: false, schema: { type: "string" } },
                    { name: "owner", in: "query", required: false, schema: { type: "string" } },
                    {
                        name: "visibility",
                        in: "query",
                        required: false,
                        schema: { type: "string", enum: ["public", "private", "internal"] },
                    },
                ],
                responses: {
                    200: { description: "Template repositories returned" },
                },
            },
        },
        "/repos/{owner}/{repo}/analytics/merge-frequency": {
            get: {
                tags: ["Analytics"],
                summary: "Get merge frequency metrics",
                description: "Returns merge frequency points for a repository with daily or weekly bucketing.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "days", in: "query", required: false, schema: { type: "integer", minimum: 7, maximum: 365, default: 30 } },
                    { name: "bucket", in: "query", required: false, schema: { type: "string", enum: ["day", "week"], default: "day" } },
                ],
                responses: {
                    200: { description: "Merge frequency metrics returned" },
                    400: { description: "Invalid query parameters", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/analytics/workload": {
            get: {
                tags: ["Analytics"],
                summary: "Get developer workload insights",
                description: "Returns repository-scoped workload scores and summary counters for contributors.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "days", in: "query", required: false, schema: { type: "integer", minimum: 7, maximum: 365, default: 30 } },
                    { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
                ],
                responses: {
                    200: { description: "Workload insights returned" },
                    400: { description: "Invalid query parameters", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/bulk-merge": {
            post: {
                tags: ["Pull Requests"],
                summary: "Queue bulk merge for multiple pull requests",
                description: "Adds multiple pull requests from the same repository to the merge queue.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/PullRequestBulkMergeRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "Bulk merge queued" },
                    400: { description: "Invalid payload or repository mismatch", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/auto-merge": {
            get: {
                tags: ["Pull Requests"],
                summary: "Get pull request auto-merge status",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Auto-merge status returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["Pull Requests"],
                summary: "Enable pull request auto-merge",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                requestBody: {
                    required: false,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    mergeMethod: { type: "string", enum: ["merge", "squash", "rebase"], default: "merge" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Auto-merge enabled" },
                    400: { description: "Invalid payload or PR not eligible", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            delete: {
                tags: ["Pull Requests"],
                summary: "Disable pull request auto-merge",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Auto-merge disabled" },
                    400: { description: "Disable failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/checks": {
            get: {
                tags: ["Pull Requests"],
                summary: "Get pull request checks",
                description: "Returns all recorded checks for a pull request plus an aggregated summary.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Check runs returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/workflow/templates": {
            get: {
                tags: ["CI/CD"],
                summary: "List workflow templates for repository setup",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "category", in: "query", required: false, schema: { type: "string" } },
                    { name: "language", in: "query", required: false, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Workflow templates returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["CI/CD"],
                summary: "Apply workflow template to repository",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    templateId: { type: "string" },
                                    workflowName: { type: "string" },
                                },
                                required: ["templateId"],
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Workflow template applied" },
                    400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/workflow/states": {
            get: {
                tags: ["Workflow"],
                summary: "List workflow PR states",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "State definitions returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["Workflow"],
                summary: "Create workflow PR state",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/WorkflowStateCreateRequest" },
                        },
                    },
                },
                responses: {
                    200: { description: "State created" },
                    400: { description: "Invalid or duplicate state payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/workflow/states/{id}": {
            delete: {
                tags: ["Workflow"],
                summary: "Delete workflow PR state",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "State deleted" },
                    400: { description: "State is in use", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "State or repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
                                    localBaseUrl: { type: "string", format: "uri" },
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
                                            local: { type: "string" },
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
