# Webhooks

Webhooks allow you to notify external systems whenever an event occurs in your OpenCodeHub repositories.

## Supported Events

- `push`: Triggered when code is pushed.
- `pull_request`: Triggered on PR open, close, reopen, merge.
- `issue`: Triggered on issue creation or updates.

## configuration

1. Navigate to **Repository Settings** > **Webhooks**.
2. Click **Add Webhook**.
3. **Payload URL**: The external URL to send the POST request to.
4. **Content Type**: `application/json` (recommended) or `application/x-www-form-urlencoded`.
5. **Secret**: detailed shared secret to sign payload (HMAC SHA-256).
6. **Events**: Select "Just the push event" or "Send me everything".

## Verifying Signatures

OpenCodeHub sends a `X-Hub-Signature-256` header. You should verify this in your consumer code to ensure the request came from OpenCodeHub.

**Node.js Example:**
```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
```

## Debugging

You can view the "Recent Deliveries" list in the Webhook settings page to see:
- Request headers and payload.
- Response status code and body.
- Delivery duration.
