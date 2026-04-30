# Webhooks API

OpenCodeHub supports outbound webhooks for event-driven integrations with external services like Slack, Discord, CI systems, and custom applications.

---

## Overview

### Supported Events

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

---

## Managing Webhooks

### Create a Webhook

```http
POST /api/repos/{owner}/{repo}/webhooks
```

**Body:**
```json
{
  "url": "https://yourapp.com/webhook",
  "events": ["push", "pull_request.opened", "issues.opened"],
  "secret": "your-webhook-secret",
  "active": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "wh_123abc",
    "url": "https://yourapp.com/webhook",
    "events": ["push", "pull_request.opened", "issues.opened"],
    "active": true,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### List Webhooks

```http
GET /api/repos/{owner}/{repo}/webhooks
```

### Update a Webhook

```http
PATCH /api/repos/{owner}/{repo}/webhooks/{id}
```

**Body:**
```json
{
  "events": ["push", "pull_request.opened"],
  "active": false
}
```

### Delete a Webhook

```http
DELETE /api/repos/{owner}/{repo}/webhooks/{id}
```

### Test a Webhook

```http
POST /api/repos/{owner}/{repo}/webhooks/{id}/test
```

Sends a test payload to the webhook URL.

---

## Payload Format

All webhook payloads follow this structure:

```json
{
  "event": "pull_request.opened",
  "repository": {
    "id": "repo_123",
    "name": "my-repo",
    "owner": "alice",
    "url": "https://git.example.com/alice/my-repo"
  },
  "sender": {
    "id": "usr_456",
    "username": "alice",
    "avatarUrl": "https://..."
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "data": { ... }
}
```

### Push Event

```json
{
  "event": "push",
  "data": {
    "ref": "refs/heads/main",
    "before": "abc123...",
    "after": "def456...",
    "commits": [
      {
        "id": "def456...",
        "message": "Fix bug",
        "author": { "name": "Alice", "email": "alice@example.com" },
        "timestamp": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

### Pull Request Opened

```json
{
  "event": "pull_request.opened",
  "data": {
    "number": 42,
    "title": "Add feature",
    "state": "open",
    "head": { "ref": "feature-branch", "sha": "abc123..." },
    "base": { "ref": "main", "sha": "def456..." },
    "author": { "username": "alice" },
    "url": "https://git.example.com/alice/my-repo/pulls/42"
  }
}
```

### Issue Opened

```json
{
  "event": "issues.opened",
  "data": {
    "number": 7,
    "title": "Bug report",
    "state": "open",
    "author": { "username": "alice" },
    "labels": ["bug"],
    "url": "https://git.example.com/alice/my-repo/issues/7"
  }
}
```

### Release Published

```json
{
  "event": "release.published",
  "data": {
    "id": "rel_123",
    "tagName": "v1.0.0",
    "name": "Version 1.0.0",
    "body": "Release notes...",
    "isDraft": false,
    "isPrerelease": false,
    "author": { "username": "alice" }
  }
}
```

---

## Signature Verification

Webhooks are signed with HMAC-SHA256 using the configured secret.

### Verifying Signatures

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

// Express example
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const payload = JSON.stringify(req.body);

  if (!verifyWebhook(payload, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  // Process webhook
  console.log('Event:', req.body.event);
  res.status(200).send('OK');
});
```

**Python:**
```python
import hmac
import hashlib

def verify_webhook(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, f"sha256={expected}")
```

---

## Delivery Guarantees

- **At-least-once delivery** — Webhooks may be delivered multiple times; use idempotency keys
- **Retry policy** — Failed deliveries are retried 3 times with exponential backoff
- **Timeout** — 30 second timeout per delivery
- **SSL verification** — HTTPS URLs are required in production

---

## URL Validation

For security, webhook URLs are validated to prevent SSRF:
- Must use HTTP or HTTPS scheme
- Cannot point to private IP ranges
- Cannot point to localhost

---

## Best Practices

1. **Use HTTPS** — Always use TLS-encrypted URLs
2. **Verify signatures** — Always validate the HMAC signature
3. **Handle duplicates** — Use idempotency keys to deduplicate
4. **Respond quickly** — Return 200 immediately and process asynchronously
5. **Set a secret** — Never leave the webhook secret empty

---

## See Also

- [Slack Integration](../features/slack-integration.md)
- [REST API](rest-api.md)
- [Storage Adapters](../guides/storage-adapters.md)
