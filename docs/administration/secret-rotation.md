# Secret Rotation and Leak Response Runbook

This runbook defines the response for exposed credentials and the routine for rotating secrets safely in OpenCodeHub environments.

## Trigger Conditions

Use this runbook immediately if any of the following happen:

- Secrets are committed to git (even temporarily).
- CI secret scan (`Gitleaks`) reports a true positive.
- Credentials are exposed in logs, backups, screenshots, or support channels.

## Immediate Containment (0-30 minutes)

1. Revoke or rotate exposed credentials first (do not wait for code cleanup).
2. Disable affected integration paths if rotation cannot be completed immediately.
3. Record incident scope:
   - secret type
   - exposure path
   - earliest commit/reference
   - impacted environments

## Rotation Order (High to Low Blast Radius)

1. Identity and access keys:
   - cloud access keys
   - OAuth client secrets
   - API tokens
2. Data plane credentials:
   - database users/passwords
   - Redis credentials
   - storage secrets
3. Service-level secrets:
   - JWT/session/internal hook secrets
   - SMTP credentials
   - observability API keys

## Technical Steps

### 1) Rotate at provider/source-of-truth

- Generate new credentials in the provider control plane.
- Revoke old credentials.
- Confirm old credentials fail authentication.

### 2) Update runtime secrets

- Update deployment environment values.
- Update secret managers and CI environment configuration.
- Never re-introduce secrets into tracked files.

### 3) Verify application health

- Run `npm run lint` and targeted tests for affected integrations.
- Validate core health endpoint and impacted API paths.
- Monitor logs for authentication/reconnect failures.

### 4) Remove plaintext remnants

- Delete local plaintext backups containing secrets.
- Replace any backup templates with sanitized placeholders.
- Keep `.env*` backups ignored in git.

## Git Hygiene and Push Guard

Local secret guard setup:

```bash
npm run hooks:install
```

Manual local scan before push:

```bash
npm run security:prepush
```

Repository policy file:

- OpenCodeHub/.gitleaks.toml

When a false positive is confirmed, add a narrowly scoped allowlist entry in the policy file with a short rationale, then re-run the scan.

Emergency bypass (only for incident mitigation with explicit team approval):

```bash
OCH_SECRET_SCAN_BYPASS=true git push
```

## Post-Incident Checklist

- Confirm every exposed credential is rotated and old credentials are invalid.
- Confirm CI secret scan is green.
- Confirm local pre-push guard is active for maintainers.
- Update tracker and incident notes with:
  - root cause
  - scope
  - remediation
  - prevention tasks

## Preventive Controls

- Keep secret scanning blocking in CI.
- Keep CI and local scans pinned to the same repository policy (`.gitleaks.toml`).
- Keep local pre-push hooks enabled on all maintainer machines.
- Use secret managers; avoid long-lived static keys where possible.
- Prefer short TTL tokens and scoped permissions.
