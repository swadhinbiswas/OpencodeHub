# Operations Drills Runbook

This runbook defines recurring resilience drills and backup rehearsals for OpenCodeHub staging/production readiness.

## Scope

- Redis outage behavior
- PostgreSQL reconnect behavior
- Backup + restore rehearsal
- CI failure ownership and escalation

## Prerequisites

- Docker + Docker Compose available
- Services runnable via `docker-compose.yml`
- Access to app health endpoint (`/api/health`)

## CI Failure Ownership

See `.github/ci/failure-ownership-map.md` for lane ownership, SLA, and escalation.

## Drill 1: Redis Outage

Run:

```bash
npm run drill:redis
```

Artifacts:

- `test-results/drills/redis-drill-baseline-health.json`
- `test-results/drills/redis-drill-degraded-health.json`
- `test-results/drills/redis-drill-recovered-health.json`
- `test-results/drills/redis-drill-app.log`

Expected outcomes:

1. Service remains responsive (may degrade, but should not crash loop).
2. Health report shows redis/scaling impact while Redis is down.
3. Health and behavior recover after Redis restart.

## Drill 2: PostgreSQL Reconnect

Run:

```bash
npm run drill:postgres
```

Artifacts:

- `test-results/drills/postgres-drill-baseline-health.json`
- `test-results/drills/postgres-drill-degraded-health.json`
- `test-results/drills/postgres-drill-recovered-health.json`
- `test-results/drills/postgres-drill-app.log`

Expected outcomes:

1. Health endpoint indicates database failure during outage.
2. App reconnects when PostgreSQL is restored.
3. No persistent crash state after recovery.

## Drill 3: Backup + Restore Rehearsal

Safe (non-destructive) rehearsal:

```bash
npm run drill:backup-restore
```

Full rehearsal (destructive restore path):

```bash
RESTORE_MODE=full npm run drill:backup-restore
```

Artifacts:

- `test-results/drills/backup-drill.log`
- `test-results/drills/backup-verify-drill.log`
- `test-results/drills/restore-drill.log`

Expected outcomes:

1. Backup archive is generated.
2. Backup verification passes checksum and manifest checks.
3. Restore path executes successfully in selected mode.

## Suggested Frequency

- Redis outage drill: weekly
- PostgreSQL reconnect drill: weekly
- Backup+restore rehearsal: weekly (safe), monthly (full)

## Reporting Template

Capture for each run:

- Date/time
- Operator
- Environment
- Result (pass/fail)
- Mean time to recovery (if outage simulated)
- Follow-up action items
