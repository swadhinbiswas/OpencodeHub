---
title: Incident Runbook
---

# OpenCodeHub Incident Runbook

Date: 2026-04-21
Owner: Platform Team
Review frequency: Quarterly

## Severity Definitions

| Severity | Impact | Response Time | Examples |
|---|---|---|---|
| P0 / Critical | Full service down, data loss risk, security breach | 15 min, 24/7 | All instances down, DB corruption, secret leaked |
| P1 / High | Major feature broken, >10% users affected | 1 hour | Auth broken, CI queue stuck, storage unavailable |
| P2 / Medium | Feature degraded, workaround exists | 4 hours | Slow UI, notifications delayed, intermittent errors |
| P3 / Low | Minor issue, cosmetic | Next sprint | UI glitch, rare 500 errors, minor perf regression |

## Incident Response Steps

### 1. Triage (< 5 min)

```bash
# Check health endpoint
curl -s https://your-domain.com/api/health | jq .

# Check error rates
curl -s https://your-domain.com/api/metrics | grep -A5 http_requests_total

# Check recent logs
curl -s https://your-domain.com/api/metrics | grep error

# Check CI queue
curl -s https://your-domain.com/api/metrics | grep ci_queue

# Check active runners
curl -s https://your-domain.com/api/metrics | grep active_runners
```

### 2. Assess

- [ ] What is the scope? (single user, single repo, all users)
- [ ] What broke? (new deploy, dependency, external service)
- [ ] Is there a workaround?
- [ ] Check recent deploys: `kubectl rollout history deployment/opencodehub`

### 3. Mitigate

```bash
# Option A: Feature flag disable
kubectl set env deployment/opencodehub FEATURE_X_DISABLED=true

# Option B: Rollback (Docker)
docker run --rm swadhinbiswas/opencodehub:previous-tag
# Update docker-compose.yml with previous tag
docker compose -f docker-compose.production.yml up -d

# Option C: Scale up (if resource issue)
kubectl scale deployment/opencodehub --replicas=5

# Option D: Restart (if memory leak suspected)
kubectl rollout restart deployment/opencodehub
```

### 4. Communicate

- Create incident Slack thread in `#incidents`
- Update status page at `status.your-domain.com`
- Notify affected users within 15 min (P0) or 1 hour (P1)

### 5. Resolve

- Verify fix with health/metrics checks
- Close incident in `#incidents` with summary
- Create postmortem within 48 hours (P0/P1)

## Common Scenarios

### Scenario 1: App Won't Start

1. Check `docker-compose logs -f app`
2. Verify PostgreSQL is reachable: `docker compose exec postgres pg_isready`
3. Check Redis is reachable: `docker compose exec redis redis-cli ping`
4. Verify env vars are set correctly
5. Check migrations ran: `docker compose exec app bun run db:migrate`

### Scenario 2: High Error Rate (5xx)

1. Check which endpoints are failing
2. Check DB query times
3. Check external dependencies (S3, email, etc.)
4. Check recent deploys
5. Roll back if recent change

### Scenario 3: CI Queue Stuck

1. Check active runners: `curl -s /api/metrics | grep active_runners`
2. Check runner logs: `kubectl logs -l runner=true`
3. Restart runner pods if needed
4. Retry stuck jobs via admin API

### Scenario 4: Slow Performance

1. Check p95/p99 latencies from metrics
2. Check DB slow queries: `docker compose exec postgres pg_stat_statements`
3. Check Redis memory: `docker compose exec redis redis-cli info memory`
4. Scale horizontally or add caching
5. Check for stuck long-running jobs

### Scenario 5: Database Connection Exhaustion

1. Check DB connections: `docker compose exec postgres psql -c "SELECT count(*) FROM pg_stat_activity"`
2. Reduce connection pool size in env
3. Restart app if needed
4. Check for long-running transactions

## RTO/RTO Targets

| Scenario | RTO (Recovery Time Objective) | RPO (Recovery Point Objective) |
|---|---|---|
| Full outage | < 30 min | < 5 min data loss |
| Data corruption | < 4 hours | < 1 hour data loss |
| Security incident | < 1 hour | < 0 (preserve evidence) |

## Contacts

| Role | Contact |
|---|---|
| Primary on-call | Check PagerDuty schedule |
| Backup on-call | Check PagerDuty schedule |
| DBA (PostgreSQL) | Check escalation chain |
| Cloud infra | AWS/GCP support portal |