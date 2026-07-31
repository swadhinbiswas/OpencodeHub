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
                    dryRun: {
                        type: "boolean",
                        description: "When true, returns eligibility details without creating reviewer requests.",
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
                description: "Authenticated callback endpoint for external agents (Greptile-like) to finalize async AI reviews.",
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
        "/repos/{owner}/{repo}/pulls/{number}": {
            get: {
                tags: ["Pull Requests"],
                summary: "Get pull request details",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Pull request returned" },
                    400: { description: "Missing parameters", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            patch: {
                tags: ["Pull Requests"],
                summary: "Update pull request metadata or workflow state",
                description: "Updates PR title/body and transitions canonical or custom state with reviewer/codeowner merge-gate checks where configured.",
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
                            schema: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    body: { type: "string" },
                                    state: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Pull request updated" },
                    400: { description: "Invalid update payload or transition", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
                description: "Returns stack approval details plus merge readiness blockers, including missing-approval and missing-required-reviewer summary metrics.",
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
                description: "Requests stack approvals for eligible reviewers. Supports dry-run eligibility previews, duplicate detection, and reviewer-not-found reporting.",
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
                description: "Returns threaded PR comments filtered by path-scoped read permissions, with `hiddenCount` for suppressed comments.",
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
            get: {
                tags: ["Pull Requests"],
                summary: "List pull request reviews",
                description: "Returns PR reviews with inline comments filtered by path-scoped read permissions, including `hiddenCommentCount` metadata.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Reviews returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
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
        "/repos/{owner}/{repo}/pulls/{number}/merge": {
            post: {
                tags: ["Pull Requests"],
                summary: "Merge pull request",
                description: "Merges an open pull request after merge-gate checks pass.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Pull request merged" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    409: { description: "Merge blocked or conflict", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/ai-review": {
            get: {
                tags: ["Pull Requests"],
                summary: "Get latest AI review for pull request",
                description: "Returns latest AI review suggestions filtered by path-scoped read permissions, including `hiddenSuggestions` metadata.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "AI review returned (or null if none)" },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["Pull Requests"],
                summary: "Trigger AI review for pull request",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "AI review triggered" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/impact": {
            get: {
                tags: ["Pull Requests"],
                summary: "Get pull request impact analysis",
                description: "Returns persisted impact findings with path-scoped read filtering applied to file path lists and `hiddenPathArtifacts` metadata.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Impact analysis returned" },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["Pull Requests"],
                summary: "Run pull request impact scan",
                description: "Runs breaking change, migration, and optional IaC hooks with path-scoped permission checks.",
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
                                    persist: { type: "boolean" },
                                    runIaCHooks: { type: "boolean" },
                                    iacAction: { type: "string", enum: ["plan", "apply"] },
                                    iacRunId: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Impact scan completed" },
                    400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/rewrite": {
            post: {
                tags: ["Pull Requests"],
                summary: "Rewrite pull request branch history",
                description: "Rewrites PR branch commits using ordered operations after path-scoped permission checks.",
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
                            schema: {
                                type: "object",
                                properties: {
                                    operations: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                type: { type: "string", enum: ["pick", "reword", "squash", "drop"] },
                                                hash: { type: "string" },
                                                newMessage: { type: "string" },
                                            },
                                            required: ["type", "hash"],
                                        },
                                    },
                                },
                                required: ["operations"],
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Rewrite completed" },
                    400: { description: "Invalid operations", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/issue-links": {
            get: {
                tags: ["Pull Requests"],
                summary: "List pull request issue links",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Issue links returned" },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["Pull Requests"],
                summary: "Create pull request issue link",
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
                            schema: {
                                type: "object",
                                properties: {
                                    issueNumber: { type: "integer" },
                                    linkType: { type: "string", enum: ["closes", "fixes", "relates", "blocks", "duplicates"] },
                                },
                                required: ["issueNumber"],
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Issue link created" },
                    400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository, pull request, or issue not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/issue-links/{id}": {
            delete: {
                tags: ["Pull Requests"],
                summary: "Delete pull request issue link",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Issue link deleted" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository, pull request, or link not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/file-approvals": {
            get: {
                tags: ["Pull Requests"],
                summary: "List pull request file approvals",
                description: "Returns file-level approval status with path-scoped read filtering and hidden path count.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "File approvals returned" },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["Pull Requests"],
                summary: "Approve changed file in pull request",
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
                            schema: {
                                type: "object",
                                properties: {
                                    path: { type: "string" },
                                    comment: { type: "string" },
                                },
                                required: ["path"],
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "File approval created or updated" },
                    400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/file-approvals/{id}": {
            delete: {
                tags: ["Pull Requests"],
                summary: "Delete pull request file approval",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "File approval deleted" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository, pull request, or approval not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
        "/repos/{owner}/{repo}/pulls": {
            post: {
                tags: ["Pull Requests"],
                summary: "Create pull request",
                description: "Creates a pull request from head branch into base branch, computes diff stats, and triggers reviewer/automation workflows.",
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
                                    title: { type: "string" },
                                    body: { type: "string" },
                                    base: { type: "string" },
                                    head: { type: "string" },
                                },
                                required: ["title", "base", "head"],
                            },
                        },
                    },
                },
                responses: {
                    201: { description: "Pull request created" },
                    400: { description: "Invalid payload or branch configuration", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or branch not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/templates": {
            get: {
                tags: ["Pull Requests"],
                summary: "Get pull request template",
                description: "Loads PR template content from common repository template locations for a target branch, with path-scoped read permission checks per candidate path.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "branch", in: "query", required: false, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Template content returned (or null)" },
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
        "/repos/{owner}/{repo}/merge-gates": {
            get: {
                tags: ["CI/CD"],
                summary: "List repository merge gates and required checks",
                description: "Returns merge policy config plus a derived report (counts, breakdown, structured warnings with code/severity/message). Optionally evaluates readiness for a specific PR via `pullNumber` query and includes actionable readiness recommendations.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "pullNumber", in: "query", required: false, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Merge gate configuration returned" },
                    400: { description: "Invalid query parameters", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["CI/CD"],
                summary: "Create required check or merge gate rule",
                description: "Allows repository admins to create `required_check` rules or higher-level `merge_gate` policies.",
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
                                oneOf: [
                                    {
                                        type: "object",
                                        properties: {
                                            kind: { type: "string", enum: ["required_check"] },
                                            branch: { type: "string" },
                                            checkName: { type: "string" },
                                            strictMode: { type: "boolean" },
                                        },
                                        required: ["kind", "branch", "checkName"],
                                    },
                                    {
                                        type: "object",
                                        properties: {
                                            kind: { type: "string", enum: ["merge_gate"] },
                                            name: { type: "string" },
                                            description: { type: "string" },
                                            gateType: { type: "string", enum: ["status_check", "review", "label", "custom"] },
                                            config: { type: "object", additionalProperties: true },
                                            conditionScript: { type: "string" },
                                        },
                                        required: ["kind", "name", "gateType"],
                                    },
                                ],
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Merge gate configuration created" },
                    400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/merge-gates/{id}": {
            patch: {
                tags: ["CI/CD"],
                summary: "Enable or disable a merge gate",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    enabled: { type: "boolean" },
                                },
                                required: ["enabled"],
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Merge gate updated" },
                    400: { description: "Invalid payload or update failure", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or merge gate not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            delete: {
                tags: ["CI/CD"],
                summary: "Delete merge gate or required check",
                description: "Deletes a repository-scoped merge gate entry. If the id belongs to a required status check, that check is deleted.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Entry deleted" },
                    400: { description: "Delete failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or entry not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
        "/admin/plugins": {
            get: {
                tags: ["Admin"],
                summary: "List loaded plugins",
                description: "Returns plugin runtime state, health, and effective config for administrators.",
                security: [{ bearerAuth: [] }],
                responses: {
                    200: { description: "Plugin list returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["Admin"],
                summary: "Load plugin from path",
                description: "Loads a plugin module from a server-local path and registers it in the plugin manager.",
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["pluginPath"],
                                properties: {
                                    pluginPath: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Plugin loaded" },
                    400: { description: "Invalid payload or plugin load failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/admin/plugins/{name}": {
            get: {
                tags: ["Admin"],
                summary: "Get plugin runtime details",
                description: "Returns plugin metadata, runtime state, and effective runtime config for a loaded plugin.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "name", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    200: { description: "Plugin details returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Plugin not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            patch: {
                tags: ["Admin"],
                summary: "Manage plugin runtime state",
                description: "Enables, disables, reloads, unloads, or updates runtime config for a loaded plugin.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "name", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["action"],
                                properties: {
                                    action: { type: "string", enum: ["enable", "disable", "reload", "unload"] },
                                    config: { type: "object", additionalProperties: true },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Plugin operation applied" },
                    400: { description: "Invalid request or operation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Plugin not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
                description: "Returns notifications for the authenticated user. Supports smart prioritization/personalization and channel-level routing filters.",
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
                    {
                        name: "personalize",
                        in: "query",
                        required: false,
                        schema: { type: "boolean" },
                    },
                    {
                        name: "channel",
                        in: "query",
                        required: false,
                        schema: { type: "string", enum: ["in_app", "email", "slack", "browser_push"] },
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
                description: "Returns aggregate blocking-alert counts, stale blocking volume, and channel routing breakdown for prioritized blocking notifications.",
                security: [{ bearerAuth: [] }],
                responses: {
                    200: { description: "Blocking summary returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    500: { description: "Summary load failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/notifications/blocking/escalations": {
            get: {
                tags: ["Notifications"],
                summary: "Preview blocking escalation candidates",
                description: "Returns unread blocking notifications older than `thresholdHours` with proposed routing channels.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        name: "thresholdHours",
                        in: "query",
                        required: false,
                        schema: { type: "integer", minimum: 1, maximum: 168, default: 4 },
                    },
                ],
                responses: {
                    200: { description: "Blocking escalation preview returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
            post: {
                tags: ["Notifications"],
                summary: "Execute blocking notification escalations",
                description: "Escalates stale blocking notifications and records routing actions in audit logs.",
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: false,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    thresholdHours: { type: "integer", minimum: 1, maximum: 168, default: 4 },
                                    channels: {
                                        type: "array",
                                        items: { type: "string", enum: ["in_app", "email", "slack", "browser_push"] },
                                    },
                                    dryRun: { type: "boolean", default: true },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Blocking escalations processed" },
                    400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/user/notification-digests/analytics": {
            get: {
                tags: ["Notifications"],
                summary: "Get digest delivery analytics",
                description: "Returns provider-level digest delivery analytics and dead-letter summaries for the authenticated user.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        name: "days",
                        in: "query",
                        required: false,
                        schema: { type: "integer", minimum: 1, maximum: 365, default: 30 },
                    },
                ],
                responses: {
                    200: { description: "Digest analytics returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/user/notification-digests/dead-letter": {
            get: {
                tags: ["Notifications"],
                summary: "List digest dead-letter entries",
                description: "Returns recent dead-letter digest delivery failures for the authenticated user.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        name: "days",
                        in: "query",
                        required: false,
                        schema: { type: "integer", minimum: 1, maximum: 365, default: 30 },
                    },
                ],
                responses: {
                    200: { description: "Dead-letter entries returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/user/notification-digests/dead-letter/retry": {
            post: {
                tags: ["Notifications"],
                summary: "Retry digest dead-letter delivery",
                description: "Triggers an immediate digest retry for the authenticated user and records the retry request in audit logs.",
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: false,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    period: { type: "string", enum: ["daily", "weekly"] },
                                    maxRetries: { type: "integer", minimum: 0, maximum: 5 },
                                    dryRun: { type: "boolean", default: false },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Dead-letter retry executed" },
                    400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
                    { name: "forecastPoints", in: "query", required: false, schema: { type: "integer", minimum: 0, maximum: 26, default: 0 } },
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
                description: "Returns repository-scoped workload scores with trend intelligence (distribution, concentration, percentiles) and actionable recommendations.",
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
        "/repos/{owner}/{repo}/pulls/{number}/merge-readiness": {
            get: {
                tags: ["Pull Requests"],
                summary: "Get pull request merge readiness",
                description: "Evaluates PR merge gates/checks and returns blockers before merge.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Merge readiness returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/state": {
            post: {
                tags: ["Pull Requests"],
                summary: "Transition pull request workflow state",
                description: "Transitions a PR by canonical state (`open|closed|custom-name`) or by `stateId` mapped from repository workflow states.",
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
                            schema: {
                                type: "object",
                                properties: {
                                    state: { type: "string" },
                                    stateId: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "State transition applied" },
                    400: { description: "Invalid transition payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository, PR, or state not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/required-reviewers": {
            get: {
                tags: ["Pull Requests"],
                summary: "Get required reviewer approval status",
                description: "Returns required reviewers for a PR and whether each required reviewer has an approving latest review.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "Required reviewer status returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/api-changes": {
            get: {
                tags: ["Pull Requests"],
                summary: "Get pull request API change detections",
                description: "Returns stored API change detections for a pull request, including breaking change flags and confidence metadata.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "API changes returned" },
                    401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    404: { description: "Repository or pull request not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                },
            },
        },
        "/repos/{owner}/{repo}/pulls/{number}/codeowner-enforcement": {
            get: {
                tags: ["Pull Requests"],
                summary: "Get CODEOWNERS enforcement status",
                description: "Returns CODEOWNERS enforcement readiness for a pull request including blocking files and approval coverage details.",
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: "owner", in: "path", required: true, schema: { type: "string" } },
                    { name: "repo", in: "path", required: true, schema: { type: "string" } },
                    { name: "number", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: { description: "CODEOWNERS enforcement status returned" },
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
        "/scim/v2/Users": {
            get: {
                tags: ["Enterprise Identity"],
                summary: "Search & List SCIM 2.0 Users",
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: "SCIM 2.0 User list response" } }
            },
            post: {
                tags: ["Enterprise Identity"],
                summary: "Provision SCIM 2.0 User",
                security: [{ bearerAuth: [] }],
                responses: { 201: { description: "SCIM 2.0 User provisioned" } }
            }
        },
        "/scim/v2/Groups": {
            get: {
                tags: ["Enterprise Identity"],
                summary: "Search & List SCIM 2.0 Groups",
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: "SCIM 2.0 Group list response" } }
            },
            post: {
                tags: ["Enterprise Identity"],
                summary: "Create SCIM 2.0 Group/Team",
                security: [{ bearerAuth: [] }],
                responses: { 201: { description: "SCIM 2.0 Group created" } }
            }
        },
        "/auth/saml/metadata": {
            get: {
                tags: ["Enterprise Identity"],
                summary: "SAML 2.0 Service Provider Metadata XML",
                responses: { 200: { description: "SAML Metadata XML" } }
            }
        },
        "/admin/backup": {
            get: {
                tags: ["Admin Operations"],
                summary: "Backup Health & Status",
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: "Backup status response" } }
            },
            post: {
                tags: ["Admin Operations"],
                summary: "Trigger Backup Snapshot",
                security: [{ bearerAuth: [] }],
                responses: { 200: { description: "Backup snapshot initiated" } }
            }
        },
        "/v2/": {
            get: {
                tags: ["Package Registry"],
                summary: "OCI Container Registry Docker v2 Ping",
                responses: { 200: { description: "OCI Docker v2 API headers" } }
            }
        }
    },
};

