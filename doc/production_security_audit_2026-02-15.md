# Production Security Audit

Date: 2026-02-15
Repository: OpenCodeHub
Scope: `src/`, `cli/`, API routes, auth flow, secrets handling, and dependency audit attempt.

## Executive Summary

Critical security issues were present and have been patched in this pass:
- Removed hardcoded JWT fallback secret and made `JWT_SECRET` mandatory.
- Enforced admin access on previously exposed admin dashboard and admin stats endpoint.
- Enforced admin access on realtime connection stats endpoint.
- Secured internal git hook endpoints by requiring `INTERNAL_HOOK_SECRET` and rejecting unauthenticated calls.
- Removed insecure fallback for cron auth (`CRON_SECRET`) and fail-closed on missing config.
- Removed fixed runner fallback secret and switched to required production secret + ephemeral dev secret.
- Prevented API key leakage in `/api/user/ai-config` GET responses (masked metadata only).
- Added encryption-at-rest for user AI provider API keys.
- Removed auth callback localhost fallbacks in production-sensitive redirect paths.
- Added regression unit tests for secret handling and strict site URL behavior.

## Fixed Findings

| Severity | Finding | Status | Evidence |
|---|---|---|---|
| Critical | Hardcoded JWT fallback secret | Fixed | `src/lib/auth.ts` |
| Critical | Admin dashboard route lacked auth guard | Fixed | `src/pages/admin/index.astro` |
| High | `/api/admin/stats` did not enforce admin auth | Fixed | `src/pages/api/admin/stats.ts` |
| High | `/api/realtime/events` stats endpoint exposed to any logged-in user | Fixed | `src/pages/api/realtime/events.ts` |
| Critical | `/api/internal/hooks/pre-receive` had no shared-secret auth | Fixed | `src/pages/api/internal/hooks/pre-receive.ts` |
| High | `/api/internal/hooks/post-receive` accepted weak default secret fallback | Fixed | `src/pages/api/internal/hooks/post-receive.ts` |
| High | Cron GC endpoint accepted weak default secret fallback | Fixed | `src/pages/api/cron/gc.ts` |
| High | Git hook installer embedded weak fallback secret | Fixed | `src/lib/git.ts` |
| Medium | Runner auth used fixed fallback secret in dev path | Fixed | `src/lib/runner-auth.ts` |
| Medium | Env validation did not require `CRON_SECRET`/`RUNNER_SECRET` | Fixed | `src/lib/env-validation.ts` |
| High | `/api/user/ai-config` could return raw API keys | Fixed | `src/pages/api/user/ai-config.ts` |
| High | AI provider API keys were stored as plain text JSON | Fixed | `src/lib/ai-config.ts`, `src/pages/api/user/ai-config.ts` |
| Medium | Auth callback routes used localhost fallback when `SITE_URL` missing | Fixed | `src/pages/api/auth/github/callback.ts`, `src/pages/api/auth/sso/callback.ts`, `src/pages/api/auth/sso/[provider].ts`, `src/lib/site-url.ts` |
| Medium | Missing regression tests for new secret/auth controls | Fixed | `tests/unit/ai-config.test.ts`, `tests/unit/site-url.test.ts`, `tests/unit/runner-auth.test.ts` |

## Remaining Risks (Not Fully Resolved)

| Severity | Risk | Evidence | Recommendation |
|---|---|---|---|
| Medium | CDN-hosted scripts are used directly (supply-chain risk) | e.g. Monaco/Alpine CDN script includes in pages | Pin versions with SRI hashes or self-host critical assets. |
| Medium | Production readiness currently blocked by pre-existing lint/type issues unrelated to this patch | `npm run lint` output (many existing errors) | Clean type/lint baseline and enforce CI gates before release. |
| Medium | Security test suite currently failing from test setup/schema issues | `tests/security.test.ts` (`db.execute is not a function`) | Repair test harness and add regression tests for newly fixed auth/secret controls. |

## Dependency Vulnerability Scan

Dependency vulnerability audit could not be completed due network resolution failure:
- `npm audit --omit=dev --json` failed with `getaddrinfo EAI_AGAIN registry.npmjs.org`.

Action required when network is available:
1. Run `npm audit --omit=dev` in repo root.
2. Run `npm audit --omit=dev` in `cli/`.
3. Triage and patch high/critical advisories first.

## Validation Notes

Checks performed in this pass:
- Static grep scan for hardcoded secrets/defaults and auth bypass patterns.
- Manual review of critical auth, admin, internal hook, and cron endpoints.
- Attempted test/lint verification (`npm run test -- tests/security.test.ts`, `npm run lint`).
- Added and executed focused regression tests for this hardening set:
  - `tests/unit/ai-config.test.ts`
  - `tests/unit/site-url.test.ts`
  - `tests/unit/runner-auth.test.ts`

Limitations:
- Full dependency CVE scan blocked by offline registry access.
- Existing repository-wide type/lint failures prevent clean full-build security validation.

## Next Production Hardening Steps

1. Expand encrypted-at-rest handling to additional sensitive config domains (beyond AI keys).
2. Repair security tests and add broader regression coverage for:
   - admin route/API authorization
   - internal hook secret verification
   - cron secret verification
   - secret redaction in config APIs
3. Re-run dependency CVE audits and patch high/critical packages.
4. Add CI security gates (lint/typecheck/tests + secret scan + audit threshold).
