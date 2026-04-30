---
title: "Webhooks API"
---

OpenCodeHub supports outbound webhooks for event-driven integrations with external services like Slack, Discord, CI systems, and custom applications.

## Supported Events

| Event | Description |
|-------|-------------|
| `push` | Code pushed to a branch |
| `pull_request.opened` | PR created |
| `pull_request.closed` | PR merged or closed |
| `pull_request.reviewed` | Review submitted on a PR |
| `issues.opened` | Issue created |
| `issues.closed` | Issue closed |
| `release.published` | Release published |
| `merge_queue.merged` | PR merged via queue |
| `merge_queue.failed` | Queue merge failed |
| `repository.created` | New repository created |

## Managing Webhooks

### Create a Webhook

```http
POST /api/repos/{owner}/{repo}/webhooks
```

**Body:**
```json
{
  "url": "https://yourapp.com/webhook",
  "events": ["push", "pull_request.opened"],
  "secret": "your-webhook-secret",
  "active": true
}
```

### List Webhooks

```http
GET /api/repos/{owner}/{repo}/webhooks
```

### Test a Webhook

```http
POST /api/repos/{owner}/{repo}/webhooks/{id}/test
```

## Payload Format

All payloads follow this structure:

```json
{
  "event": "pull_request.opened",
  "repository": {
    "id": "repo_123",
    "name": "my-repo",
    "owner": "alice"
  },
  "sender": {
    "id": "usr_456",
    "username": "alice"
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "data": { ... }
}
```

## Signature Verification

Webhooks are signed with HMAC-SHA256 using the configured secret.

**Node.js:**
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expected}`)
  );
}
```

## Best Practices

1. Use HTTPS URLs only
2. Always verify the HMAC signature
3. Handle duplicate deliveries with idempotency keys
4. Respond quickly (return 200 immediately)
5. Never leave the webhook secret empty
