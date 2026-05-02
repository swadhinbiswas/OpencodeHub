---
title: "CircleCI Integration"
description: "Use CircleCI as your external CI/CD provider with OpenCodeHub"
---

> **Status:** Fully Supported | **Difficulty:** Easy | **Time:** 10 minutes

OpenCodeHub has **native built-in integration** with CircleCI. You don't need any custom scripts or plugins — just connect your repository to CircleCI and OpenCodeHub will automatically trigger builds, receive status updates, and block merges until CI passes.

---

## How It Works

```
Push to PR branch
    |
    v
OpenCodeHub detects push → triggers CircleCI pipeline via API
    |
    v
CircleCI runs tests/builds → reports status back to OpenCodeHub
    |
    v
PR checks show ✅ or ❌ → Merge queue waits for green status
```

---

## Prerequisites

- An active [CircleCI](https://circleci.com/) account
- Your repository code is on OpenCodeHub (not GitHub)
- A CircleCI [Personal API Token](https://app.circleci.com/settings/user/tokens)

---

## Step 1: Configure CircleCI in OpenCodeHub

### Via Web UI

1. Go to your repository on OpenCodeHub
2. Click **Settings** → **Integrations** → **External CI**
3. Click **Add Integration** → Select **CircleCI**
4. Fill in the form:

| Field | Example Value | Description |
|-------|--------------|-------------|
| **Name** | `CircleCI Production` | Label for this integration |
| **Base URL** | `https://circleci.com` | CircleCI API base URL |
| **API Token** | `cci_xxxxxxxxxx` | Your CircleCI Personal API Token |
| **Project ID** | `gh/yourorg/yourrepo` | CircleCI project slug (see below) |
| **Sync Status** | ✅ Enabled | Report build status back to PRs |

### Finding Your Project ID

The **Project ID** (also called "project slug") depends on where your code is hosted. Even though your code is on OpenCodeHub, CircleCI needs a project identifier.

**Option A: Use a CircleCI-specific identifier**
```
circleci/<your-org>/<your-repo>
```

**Option B: Use VCS-style slug**
```
gh/<org>/<repo>     # If you mirror to GitHub
gl/<group>/<repo>   # If you mirror to GitLab
bb/<workspace>/<repo> # If you mirror to Bitbucket
```

> **Note:** If you don't mirror to GitHub/GitLab, you can still use CircleCI by setting up a "standalone" project. Use any unique slug like `circleci/my-team/my-project`.

### Via API

```bash
curl -X POST https://git.yourdomain.com/api/repos/yourname/yourrepo/integrations/external-ci \
  -H "Authorization: Bearer <your-opencodehub-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "circleci",
    "name": "CircleCI Production",
    "baseUrl": "https://circleci.com",
    "apiToken": "cci_your_circleci_token",
    "projectId": "circleci/my-org/my-repo",
    "isEnabled": true,
    "syncStatus": true
  }'
```

---

## Step 2: Set Up the Checks Endpoint

After saving the integration, OpenCodeHub generates a **Checks Endpoint** and a **Webhook Secret**.

### Get Your Endpoint

```bash
curl https://git.yourdomain.com/api/repos/yourname/yourrepo/external-ci \
  -H "Authorization: Bearer <your-opencodehub-token>"
```

Response:
```json
{
  "enabled": true,
  "checksEndpoint": "https://git.yourdomain.com/api/repos/yourname/yourrepo/external-ci/checks",
  "status": "active"
}
```

### Generate/Rotate Token

```bash
curl -X POST https://git.yourdomain.com/api/repos/yourname/yourrepo/external-ci \
  -H "Authorization: Bearer <your-opencodehub-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "CircleCI"}'
```

Response:
```json
{
  "token": "och_ext_xxxxxxxxxxxx",
  "rotated": false
}
```

> **Save this token securely** — you will use it in your CircleCI config to report status back.

---

## Step 3: Configure Your CircleCI Pipeline

Create or update `.circleci/config.yml` in your repository:

```yaml
version: 2.1

jobs:
  test:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - run:
          name: Install dependencies
          command: npm ci
      - run:
          name: Run tests
          command: npm test
      - run:
          name: Report status to OpenCodeHub
          command: |
            # Send check status to OpenCodeHub
            curl -X POST "${OPENCODEHUB_CHECKS_ENDPOINT}" \
              -H "Authorization: Bearer ${OPENCODEHUB_TOKEN}" \
              -H "Content-Type: application/json" \
              -d "{
                \"name\": \"circleci/test\",
                \"headSha\": \"${CIRCLE_SHA1}\",
                \"status\": \"completed\",
                \"conclusion\": \"success\",
                \"externalId\": \"${CIRCLE_WORKFLOW_ID}\",
                \"detailsUrl\": \"${CIRCLE_BUILD_URL}\",
                \"output\": {
                  \"title\": \"Tests Passed\",
                  \"summary\": \"All ${CIRCLE_NODE_TOTAL} test suites passed.\"
                }
              }"
          when: on_success

      - run:
          name: Report failure to OpenCodeHub
          command: |
            curl -X POST "${OPENCODEHUB_CHECKS_ENDPOINT}" \
              -H "Authorization: Bearer ${OPENCODEHUB_TOKEN}" \
              -H "Content-Type: application/json" \
              -d "{
                \"name\": \"circleci/test\",
                \"headSha\": \"${CIRCLE_SHA1}\",
                \"status\": \"completed\",
                \"conclusion\": \"failure\",
                \"externalId\": \"${CIRCLE_WORKFLOW_ID}\",
                \"detailsUrl\": \"${CIRCLE_BUILD_URL}\",
                \"output\": {
                  \"title\": \"Tests Failed\",
                  \"summary\": \"Test suite failed. See build logs for details.\"
                }
              }"
          when: on_fail

workflows:
  ci:
    jobs:
      - test
```

### Set Environment Variables in CircleCI

1. Go to your project in CircleCI dashboard
2. **Project Settings** → **Environment Variables**
3. Add:

| Variable | Value |
|----------|-------|
| `OPENCODEHUB_CHECKS_ENDPOINT` | `https://git.yourdomain.com/api/repos/yourname/yourrepo/external-ci/checks` |
| `OPENCODEHUB_TOKEN` | `och_ext_xxxxxxxxxxxx` (from Step 2) |

---

## Step 4: Optional — CircleCI Webhook to OpenCodeHub

Instead of manually reporting from the config, you can set up CircleCI to send webhooks to OpenCodeHub automatically.

### Using CircleCI Webhooks (Recommended)

1. In CircleCI, go to **Project Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configuration:
   - **Webhook URL**: `https://git.yourdomain.com/api/repos/yourname/yourrepo/external-ci/checks`
   - **Authorization Header**: `Bearer och_ext_xxxxxxxxxxxx`
   - **Events**: Select `workflow.completed` and `job.completed`

OpenCodeHub already understands CircleCI's native webhook payload format, so no translation layer is needed.

---

## Step 5: Test the Integration

1. Create a pull request on OpenCodeHub
2. Push a commit to the PR branch
3. OpenCodeHub will trigger CircleCI automatically
4. CircleCI runs the pipeline
5. Status appears on the PR as a check:
   - 🟡 **Pending** — build queued or running
   - 🔴 **Failure** — tests failed
   - 🟢 **Success** — all checks passed

### View Build History

```bash
curl "https://git.yourdomain.com/api/repos/yourname/yourrepo/integrations/external-ci?summary=1" \
  -H "Authorization: Bearer <your-opencodehub-token>"
```

---

## Merge Queue + CircleCI

If you use OpenCodeHub's [merge queue](/features/merge-queue/), it automatically respects CircleCI status:

```
PR added to queue
    |
    v
Queue waits for CircleCI check → "success"
    |
    v
If check fails → PR removed from queue, author notified
    |
    v
If check passes → PR merged automatically
```

No extra configuration needed. The merge queue reads PR checks automatically.

---

## API Reference

### Trigger Build Manually

```bash
curl -X POST "https://git.yourdomain.com/api/repos/yourname/yourrepo/integrations/external-ci/{config-id}/trigger" \
  -H "Authorization: Bearer <your-opencodehub-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "branch": "feature/new-stuff",
    "commitSha": "abc123..."
  }'
```

### Sync Build Status

```bash
curl -X POST "https://git.yourdomain.com/api/repos/yourname/yourrepo/integrations/external-ci/{config-id}/sync" \
  -H "Authorization: Bearer <your-opencodehub-token>"
```

### Delete Integration

```bash
curl -X DELETE "https://git.yourdomain.com/api/repos/yourname/yourrepo/integrations/external-ci/{config-id}" \
  -H "Authorization: Bearer <your-opencodehub-token>"
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **"External CI integration not configured"** | Verify the integration is saved and `isEnabled: true`. Check the repo settings. |
| **"Invalid external CI token"** | The token used in the `Authorization` header doesn't match. Rotate the token in repo settings and update CircleCI env vars. |
| **Build triggered but no status on PR** | Make sure the `headSha` in the check payload matches the PR's latest commit SHA. |
| **CircleCI pipeline not triggering** | Verify your CircleCI API token has permissions. Check that `projectId` is correct. |
| **Webhook payload rejected** | OpenCodeHub accepts native CircleCI webhooks. If using custom payloads, use the normalized format with `name`, `headSha`, and `status` fields. |
| **Merge queue not waiting for CircleCI** | Ensure `syncStatus` is enabled on the integration. Check that PR checks are being created (visible in PR page). |

---

## Supported CircleCI Payload Fields

When sending checks to `/external-ci/checks`, OpenCodeHub accepts these fields:

```json
{
  "name": "circleci/test",
  "headSha": "abc123...",
  "status": "completed",
  "conclusion": "success",
  "externalId": "workflow-id-123",
  "detailsUrl": "https://circleci.com/gh/org/repo/123",
  "output": {
    "title": "Tests Passed",
    "summary": "All tests passed in 2m 34s",
    "text": "Optional detailed markdown output"
  }
}
```

**Status values:** `queued`, `in_progress`, `completed`
**Conclusion values:** `success`, `failure`, `neutral`, `cancelled`, `timed_out`, `action_required`

---

## Next Steps

- [Set up Merge Queue](/features/merge-queue/)
- [Configure Branch Protection](/guides/branch-protection/)
- [Add more external CI providers](/guides/external-ci/) (GitLab CI, Jenkins, Buildkite)
