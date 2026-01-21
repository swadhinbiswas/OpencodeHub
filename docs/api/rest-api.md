# REST API Reference

OpenCodeHub provides a REST API to interact with repositories, users, and pull requests programmatically.

- **Base URL**: `/api`
- **Authentication**: Bearer Token (see [Authentication](authentication.md))
- **Response Format**: JSON

---

## 👤 Users

### Get Current User
Retrieve the profile of the currently authenticated user.

\`\`\`http
GET /users/me
\`\`\`

**Response:**
\`\`\`json
{
  "id": "user_123abc...",
  "username": "johndoe",
  "email": "john@example.com",
  "avatarUrl": "/uploads/avatars/user_123.jpg",
  "createdAt": "2024-01-01T00:00:00Z"
}
\`\`\`

---

## 📦 Repositories

### List My Repositories
Get a list of repositories owned by the authenticated user.

\`\`\`http
GET /repos
\`\`\`

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| \`page\` | int | Page number (default: 1) |
| \`limit\` | int | Items per page (default: 20) |

**Response:**
\`\`\`json
[
  {
    "id": "repo_789xyz",
    "owner": "johndoe",
    "name": "awesome-project",
    "visibility": "public",
    "description": "My standardized API docs",
    "updatedAt": "2024-03-15T10:00:00Z"
  }
]
\`\`\`

### Create Repository
Create a new repository.

\`\`\`http
POST /repos
\`\`\`

**Body:**
\`\`\`json
{
  "name": "new-project",
  "visibility": "private", // "public", "private", "internal"
  "description": "Optional description",
  "init": true // Initialize with README
}
\`\`\`

### Get Repository Details
\`\`\`http
GET /repos/{owner}/{repo}
\`\`\`

---

## 🔀 Pull Requests

### List Pull Requests
List PRs for a specific repository.

\`\`\`http
GET /repos/{owner}/{repo}/pulls
\`\`\`

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| \`state\` | string | \`open\`, \`closed\`, \`merged\`, \`all\` |

**Response:**
\`\`\`json
[
  {
    "number": 1,
    "title": "Add documentation",
    "state": "open",
    "author": { "username": "jane" },
    "createdAt": "...",
    "reviewStatus": "approved"
  }
]
\`\`\`

### Create Pull Request
\`\`\`http
POST /repos/{owner}/{repo}/pulls
\`\`\`

**Body:**
\`\`\`json
{
  "title": "Fix login bug",
  "description": "Fixes issue #42...",
  "head": "feature/login-fix", // source branch
  "base": "main"             // target branch
}
\`\`\`

---

## 🏗 CI/CD

### List Workflow Runs
Get execution history of pipelines.

\`\`\`http
GET /repos/{owner}/{repo}/actions/runs
\`\`\`

---

## ⚠️ Errors

The API uses standard HTTP status codes.

| Code | Meaning |
|------|---------|
| \`200\` | Success |
| \`201\` | Created |
| \`400\` | Bad Request (Validation Error) |
| \`401\` | Unauthorized (Missing/Invalid Token) |
| \`403\` | Forbidden (Insufficient permissions) |
| \`404\` | Not Found |
| \`429\` | Too Many Requests (Rate Limit Exceeded) |

**Error Body:**
\`\`\`json
{
  "error": "Resource not found",
  "code": "NOT_FOUND"
}
\`\`\`
