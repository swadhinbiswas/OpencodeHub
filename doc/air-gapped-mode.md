# Air-Gapped Mode

OpenCodeHub supports an offline deployment mode for restricted environments.

## Enable

Set:

```env
AIR_GAPPED_MODE=true
```

## Runtime behavior

When enabled, OpenCodeHub blocks third-party integration flows that require external network access. Current guardrails include:

- External CI status ingestion endpoint (`/api/repos/:owner/:repo/external-ci/checks`)
- Issue tracker webhooks (`/api/repos/:owner/:repo/integrations/issue-trackers/:provider/webhook`)
- Code quality webhooks (`/api/repos/:owner/:repo/integrations/code-quality/webhooks/:provider`)
- Integration libraries for external CI, Jira/Linear/Trello/ClickUp, Codecov/Coveralls/SonarQube/Snyk

Blocked API paths return HTTP `503` with code `AIR_GAPPED_MODE`.

## Operational notes

- Keep internal features enabled (repo, issues, PRs, local CI runner).
- Disable or hide third-party integration setup in user-facing environments.
- For production, pair this mode with restricted egress firewall policy.
