# External Ecosystem Runbook

This runbook covers setup, validation, and troubleshooting for third-party CI, issue tracker, and quality integrations.

## Scope

- CI status ingestion: Jenkins, CircleCI, Buildkite, GitLab CI
- Issue trackers: Jira, Linear, Trello, ClickUp
- Quality/coverage: Codecov, Coveralls, SonarQube, Snyk

## Prerequisites

- `AIR_GAPPED_MODE=false`
- Repository admin/write access for integration setup APIs
- Valid provider webhook/token credentials

## 1) External CI (Jenkins/CircleCI/Buildkite/GitLab)

### API endpoint

- Ingest check status:
  - `POST /api/repos/:owner/:repo/external-ci/checks`

### Required auth

- `Authorization: Bearer <external-ci-token>`
- or `X-OpenCodeHub-Token: <external-ci-token>`

### Minimal payload

```json
{
  "pullRequestNumber": 42,
  "name": "ci/build",
  "headSha": "abc123...",
  "status": "completed",
  "conclusion": "success",
  "detailsUrl": "https://ci.example.com/build/42"
}
```

### Smoke test

```bash
curl -X POST "https://<host>/api/repos/<owner>/<repo>/external-ci/checks" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"pullRequestNumber":1,"name":"ci/build","headSha":"abc","status":"completed","conclusion":"success"}'
```

## 2) Issue Tracker Webhooks (Jira/Linear/Trello/ClickUp)

### API endpoint

- `POST /api/repos/:owner/:repo/integrations/issue-trackers/:provider/webhook`

### Provider values

- `jira`
- `linear`
- `trello`
- `clickup`

### Auth

- `x-webhook-secret: <secret>`
- or `x-opencodehub-webhook-secret: <secret>`
- or query `?secret=<secret>`

### Smoke test

```bash
curl -X POST "https://<host>/api/repos/<owner>/<repo>/integrations/issue-trackers/linear/webhook?secret=<secret>" \
  -H "Content-Type: application/json" \
  -d '{"action":"update","data":{"id":"ISS-1","state":{"name":"Done"}}}'
```

## 3) Code Quality Webhooks (Codecov/Coveralls/SonarQube/Snyk)

### API endpoint

- `POST /api/repos/:owner/:repo/integrations/code-quality/webhooks/:provider`

### Provider values

- `codecov`
- `coveralls`
- `sonarqube`
- `snyk`

### Auth

- `x-webhook-secret: <secret>`
- or `x-opencodehub-webhook-secret: <secret>`
- or query `?secret=<secret>`

### Smoke test

```bash
curl -X POST "https://<host>/api/repos/<owner>/<repo>/integrations/code-quality/webhooks/codecov?secret=<secret>" \
  -H "Content-Type: application/json" \
  -d '{"repo":{"name":"demo"},"commit":{"commitid":"abc"},"totals":{"coverage":80,"lines":100,"hits":80}}'
```

## Expected responses

- `200`: webhook accepted and processed
- `400`: bad payload/provider
- `401`: missing/invalid webhook secret or token
- `503`: blocked by air-gapped mode (`AIR_GAPPED_MODE=true`)

## Troubleshooting

- `400 Unsupported provider`
  - Check provider path segment exactly matches supported provider values.
- `401 Missing webhook secret`
  - Set one of required secret headers or query string secret.
- `401 Invalid webhook credentials or payload`
  - Verify stored integration webhook secret/token and payload schema.
- `503 AIR_GAPPED_MODE`
  - Disable air-gapped mode or avoid third-party webhook flow.
- CI status not reflected on PR
  - Ensure `pullRequestNumber`/`pullRequestId` and `headSha` match the target PR.

## Operational checks

- Run provider route tests:
  - `tests/integration/provider-webhook-routes.test.ts`
- Run air-gapped enforcement tests:
  - `tests/integration/air-gapped-api.test.ts`
- Run provider matrix tests:
  - `tests/unit/external-ci-providers.test.ts`
