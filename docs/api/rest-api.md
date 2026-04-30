# REST API Reference

OpenCodeHub provides a comprehensive REST API with 140+ endpoints for interacting with repositories, users, pull requests, issues, and more programmatically.

- **Base URL**: `/api`
- **Authentication**: Bearer Token or Personal Access Token (see [Authentication](authentication.md))
- **Response Format**: JSON with standard `{ success, data, meta? }` wrapper
- **Rate Limit**: 100 requests/minute (authenticated), 20/minute (unauthenticated)

---

## Users

### Get Current User

```http
GET /api/user
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "usr_123abc",
    "username": "johndoe",
    "email": "john@example.com",
    "displayName": "John Doe",
    "avatarUrl": "/uploads/avatars/usr_123.jpg",
    "bio": "Full-stack developer",
    "location": "San Francisco",
    "website": "https://johndoe.dev",
    "company": "Acme Inc",
    "isAdmin": false,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### Get / Update / Delete Profile

```http
GET    /api/auth/me
PATCH  /api/auth/me
DELETE /api/auth/me
```

**PATCH Body:**
```json
{
  "displayName": "John Doe",
  "bio": "Updated bio",
  "location": "New York",
  "website": "https://example.com",
  "company": "New Co"
}
```

---

## Repositories

### List Repositories

```http
GET /api/repos?page=1&per_page=20
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "repo_789xyz",
      "owner": "johndoe",
      "name": "awesome-project",
      "visibility": "public",
      "description": "My awesome project",
      "updatedAt": "2024-03-15T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### Create Repository

```http
POST /api/repos
```

**Body:**
```json
{
  "name": "new-project",
  "visibility": "private",
  "description": "Optional description",
  "init": true
}
```

### Get Repository Details

```http
GET /api/repos/{owner}/{repo}
```

### Update Repository

```http
PATCH /api/repos/{owner}/{repo}
```

**Body:**
```json
{
  "description": "Updated description",
  "visibility": "public",
  "defaultBranch": "main"
}
```

### Delete Repository

```http
DELETE /api/repos/{owner}/{repo}
```

---

## Issues

### List Issues

```http
GET /api/repos/{owner}/{repo}/issues?state=open&page=1
```

**Query Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `state` | string | `open`, `closed`, `all` |
| `label` | string | Filter by label |
| `assignee` | string | Filter by assignee username |
| `page` | int | Page number |
| `per_page` | int | Items per page (max 100) |

### Create Issue

```http
POST /api/repos/{owner}/{repo}/issues
```

**Body:**
```json
{
  "title": "Bug report",
  "body": "Something is broken",
  "type": "issue",
  "labels": ["bug"],
  "assignees": ["username"]
}
```

### Get Issue

```http
GET /api/repos/{owner}/{repo}/issues/{number}
```

### Update Issue

```http
PATCH /api/repos/{owner}/{repo}/issues/{number}
```

**Body:**
```json
{
  "title": "Updated title",
  "state": "closed",
  "labels": ["bug", "priority"]
}
```

### Add Comment

```http
POST /api/repos/{owner}/{repo}/issues/{number}/comments
```

**Body:**
```json
{
  "body": "This is a comment"
}
```

---

## Pull Requests

### List Pull Requests

```http
GET /api/repos/{owner}/{repo}/pulls?state=open
```

**Query Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `state` | string | `open`, `closed`, `merged`, `all` |
| `head` | string | Filter by head branch |
| `base` | string | Filter by base branch |

### Create Pull Request

```http
POST /api/repos/{owner}/{repo}/pulls
```

**Body:**
```json
{
  "title": "Fix login bug",
  "body": "Fixes issue #42",
  "head": "feature/login-fix",
  "base": "main"
}
```

### Get Pull Request

```http
GET /api/repos/{owner}/{repo}/pulls/{number}
```

### Update Pull Request

```http
PATCH /api/repos/{owner}/{repo}/pulls/{number}
```

### Merge Pull Request

```http
POST /api/repos/{owner}/{repo}/pulls/{number}/merge
```

**Body:**
```json
{
  "method": "squash",
  "message": "Custom merge message"
}
```

### List Reviews

```http
GET /api/repos/{owner}/{repo}/pulls/{number}/reviews
```

### Create Review

```http
POST /api/repos/{owner}/{repo}/pulls/{number}/reviews
```

**Body:**
```json
{
  "body": "Looks good!",
  "event": "APPROVE",
  "comments": [
    {
      "path": "src/auth.ts",
      "line": 45,
      "body": "Consider adding error handling here"
    }
  ]
}
```

---

## Stacked PRs

### List Stacks

```http
GET /api/repos/{owner}/{repo}/stacks
```

### Create Stack Entry

```http
POST /api/repos/{owner}/{repo}/stacks
```

**Body:**
```json
{
  "prNumber": 124,
  "basePrNumber": 123
}
```

### Sync Stack

```http
POST /api/repos/{owner}/{repo}/stacks/sync
```

---

## Merge Queue

### List Queue

```http
GET /api/repos/{owner}/{repo}/merge-queue
```

### Add to Queue

```http
POST /api/repos/{owner}/{repo}/merge-queue
```

**Body:**
```json
{
  "prNumber": 125,
  "priority": "normal"
}
```

### Remove from Queue

```http
DELETE /api/repos/{owner}/{repo}/merge-queue/{entryId}
```

---

## CI/CD (Actions)

### List Workflow Runs

```http
GET /api/repos/{owner}/{repo}/actions/runs
```

### Get Workflow Run

```http
GET /api/repos/{owner}/{repo}/actions/runs/{runId}
```

### List Jobs

```http
GET /api/repos/{owner}/{repo}/actions/runs/{runId}/jobs
```

### Get Job Logs

```http
GET /api/repos/{owner}/{repo}/actions/jobs/{jobId}/logs
```

### Rerun Workflow

```http
POST /api/repos/{owner}/{repo}/actions/runs/{runId}/rerun
```

### Cancel Workflow

```http
POST /api/repos/{owner}/{repo}/actions/runs/{runId}/cancel
```

---

## Releases

### List Releases

```http
GET /api/repos/{owner}/{repo}/releases
```

### Create Release

```http
POST /api/repos/{owner}/{repo}/releases
```

**Body:**
```json
{
  "tagName": "v1.0.0",
  "name": "Release 1.0.0",
  "body": "Release notes...",
  "isDraft": false,
  "isPrerelease": false
}
```

### Get Release

```http
GET /api/repos/{owner}/{repo}/releases/{id}
```

### Delete Release

```http
DELETE /api/repos/{owner}/{repo}/releases/{id}
```

---

## Organizations

### List Organizations

```http
GET /api/orgs
```

### Get Organization

```http
GET /api/orgs/{org}
```

### List Members

```http
GET /api/orgs/{org}/members
```

### Add Member

```http
POST /api/orgs/{org}/members
```

**Body:**
```json
{
  "username": "newmember",
  "role": "member"
}
```

---

## Notifications

### List Notifications

```http
GET /api/notifications?filter=unread&prioritize=true
```

**Query Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `filter` | string | `unread`, `read`, `archived`, `blocking`, `all` |
| `prioritize` | boolean | Sort by priority score |
| `personalize` | boolean | Apply personalization boost |
| `channel` | string | Filter by routing channel |

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif_1",
        "type": "comment",
        "priority": "medium",
        "priorityScore": 5,
        "isRead": false,
        "actor": { "username": "bob" },
        "repository": { "name": "my-repo" }
      }
    ],
    "unreadCount": 3,
    "routing": {
      "personalized": true,
      "channelFilter": null
    }
  }
}
```

### Mark as Read

```http
POST /api/notifications/{id}/read
```

### Archive Notification

```http
POST /api/notifications/{id}/archive
```

---

## Webhooks

### List Webhooks

```http
GET /api/repos/{owner}/{repo}/webhooks
```

### Create Webhook

```http
POST /api/repos/{owner}/{repo}/webhooks
```

**Body:**
```json
{
  "url": "https://yourapp.com/webhook",
  "events": ["push", "pull_request", "issues"],
  "secret": "your-webhook-secret"
}
```

### Test Webhook

```http
POST /api/repos/{owner}/{repo}/webhooks/{id}/test
```

### Delete Webhook

```http
DELETE /api/repos/{owner}/{repo}/webhooks/{id}
```

---

## Search

### Global Search

```http
GET /api/search?q=keyword&type=repositories
```

**Query Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `q` | string | Search query |
| `type` | string | `repositories`, `users`, `issues`, `pull_requests` |
| `page` | int | Page number |

---

## Admin

### System Stats

```http
GET /api/admin/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRepos": 45,
    "totalUsers": 12,
    "collaborations": 128,
    "systemStatus": {
      "cpuLoad": 15,
      "memoryUsage": 42,
      "storageUsage": 45,
      "uptime": "5d 3h 12m"
    },
    "quickStats": {
      "commitsToday": 23,
      "prsMerged": 5,
      "issuesClosed": 8,
      "activeUsers": 6
    }
  }
}
```

### Audit Logs

```http
GET /api/admin/audit-logs?page=1
```

### List Runners

```http
GET /api/admin/runners
```

---

## Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 200 | — | Success |
| 201 | — | Created |
| 204 | — | No Content |
| 400 | BAD_REQUEST | Invalid request parameters |
| 401 | UNAUTHORIZED | Missing or invalid authentication |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Resource conflict |
| 422 | VALIDATION_ERROR | Validation failed |
| 429 | RATE_LIMITED | Too many requests |
| 500 | SERVER_ERROR | Internal server error |

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Repository not found"
  }
}
```

---

## Pagination

List endpoints support pagination via query parameters:

```http
GET /api/repos?page=2&per_page=50
```

Pagination metadata is included in the response:
```json
{
  "meta": {
    "page": 2,
    "perPage": 50,
    "total": 127,
    "totalPages": 3
  }
}
```
