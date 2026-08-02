---
title: "Monitoring and Observability"
---

# Monitoring and Observability

OpenCodeHub supports OpenTelemetry (OTLP) for logs and metrics, allowing you to stream data to any compatible backend (Grafana Cloud, Prometheus/Loki, Datadog).

## Production Baseline

The minimum production observability stack should include:

- `GET /api/health` for liveness/readiness
- `GET /api/metrics` for Prometheus scraping
  (protected by `METRICS_TOKEN` when set — pass it as a Bearer token in the
  scrape config; see `deploy/prometheus.yml`)
- Grafana dashboards for request latency, queue health, and storage/DB timing
- Alerting for p95 regressions and service degradation

## Service Level Objectives (SLOs)

These are the committed targets for production deployments.

### Availability SLO

| Indicator | Target | Burn Rate Alert |
|---|---|---|
| API + Web availability | 99.9% monthly (43.8 min downtime/month) | Page at 15% burn rate |
| Health endpoint 5xx rate | < 0.1% in any 5m window | Page at >5% error rate for 5m |
| Git operation success | 99.5% monthly | Page at >1% failures for 5m |

### Latency SLO

| Endpoint Type | Target (p95) | Target (p99) | Burn Rate Alert |
|---|---|---|---|
| API read requests | < 500ms | < 1s | Page at p95 > 1s for 5m |
| API write requests | < 1s | < 3s | Page at p95 > 2s for 5m |
| DB queries | < 200ms | < 1s | Page at p95 > 1s for 5m |
| Storage operations | < 3s | < 10s | Page at p95 > 5s for 10m |
| Git clone/push | < 10s | < 30s | Page at p95 > 30s for 10m |
| CI job dispatch | < 2s | < 5s | Page at p95 > 5s for 5m |
| Page renders (SSR) | < 1s | < 3s | Page at p95 > 3s for 5m |

### Throughput & Queue SLO

| Indicator | Target | Alert |
|---|---|---|
| CI queue depth | < 20 jobs | Page at > 20 jobs for 10m |
| Active runners | > 0 | Page if 0 for 5m |
| CI job success rate | > 90% | Warn at > 30% failure rate for 30m |
| Rate limit hit rate | < 10/sec | Info warn at > 10/sec for 5m |

### Security SLO

| Indicator | Target | Alert |
|---|---|---|
| Auth failure rate | < 5% | Warn at > 30% failure rate for 5m |
| Secret scan findings | 0 new leaks | Block pipeline on new leaks |
| Dependency CVEs | 0 critical/high unpatched | Block pipeline on critical |

### Error Budget

- **Monthly error budget**: 43.8 minutes of downtime (for 99.9% target)
- **Latency budget**: Based on p95 thresholds above
- **Policy**: New features ship only when error budget > 50% remaining

### SLO Implementation

SLOs are tracked via Prometheus metrics in `deploy/prometheus/alert-rules.yml` and visualized in `deploy/grafana/dashboard.json`.

Query examples for Grafana:

```
# API availability SLO
sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# p95 latency SLO
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

## Grafana Dashboard

The production dashboard is available at `deploy/grafana/dashboard.json`. Import it into your Grafana instance for:
- Real-time request latency (p50/p95/p99)
- Error rates by endpoint
- DB query performance
- CI queue depth and runner activity
- Storage operation timing
- Auth success/failure rates

## Grafana Cloud Setup (Recommended)

This guide explains how to stream logs from OpenCodeHub to [Grafana Cloud](https://grafana.com/products/cloud/).

### 1. Get Credentials

1. **Log in** to your Grafana Cloud Portal.
2. Find your **Stack** and locate the **"OpenTelemetry"** or **"OTLP"** section.
3. Click **"Configure"**.

### 2. Configure Environment

You need three values for your `.env` file:

**GRAFANA_OTLP_ENDPOINT**
The OTLP endpoint URL for your region.
*   US: `https://otlp-gateway-prod-us-central-0.grafana.net/otlp/v1/logs`
*   EU: `https://otlp-gateway-prod-eu-west-0.grafana.net/otlp/v1/logs`

**GRAFANA_INSTANCE_ID**
Your numeric Instance ID (found in Loki/OTLP settings).

**GRAFANA_API_KEY**
An Access Policy Token with `logs:write` scope.

### 3. Update Configuration

Add these to your `.env` file:

```bash
# Grafana Cloud OTLP Logging
GRAFANA_OTLP_ENDPOINT=https://otlp-gateway-prod-us-central-0.grafana.net/otlp/v1/logs
GRAFANA_INSTANCE_ID=123456
GRAFANA_API_KEY=glc_...
```

Restart your application (`bun run dev` or docker restart).

### 4. View Logs

1. Go to Grafana **Explore**.
2. Select **Loki** data source.
3. Query: `{service_name="opencodehub"}`.

## Self-Hosted Loki

If you run your own Loki instance, point the endpoint to your local instance:

```bash
GRAFANA_OTLP_ENDPOINT=http://loki:3100/otlp/v1/logs
```
