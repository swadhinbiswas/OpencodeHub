# Monitoring and Observability

OpenCodeHub supports OpenTelemetry (OTLP) for logs and metrics, allowing you to stream data to any compatible backend (Grafana Cloud, Prometheus/Loki, Datadog).

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
