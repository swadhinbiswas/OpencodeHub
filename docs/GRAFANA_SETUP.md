# Setting up Grafana Cloud Logging (OTLP)

This guide explains how to get the credentials required to stream logs from OpenCodeHub to Grafana Cloud using the OTLP (OpenTelemetry) protocol.

## Prerequisites

1.  A verified account on [Grafana Cloud](https://grafana.com/products/cloud/). (They have a generous free tier).

## Step-by-Step Guide

1.  **Log in** to your Grafana Cloud Portal at [grafana.com](https://grafana.com).
2.  Navigate to **"My Account"** or the main dashboard.
3.  Find your **Stack** and locate the **"OpenTelemetry"** or **"OTLP"** section.
4.  Click on **"Configure"** or **"Details"**.

## Finding Your Credentials

You will need three values for your `.env` file:

### 1. GRAFANA_OTLP_ENDPOINT
*   The OTLP endpoint URL for your region.
*   Examples:
    - Asia-Pacific: `https://otlp-gateway-prod-ap-south-1.grafana.net/otlp/v1/logs`
    - US: `https://otlp-gateway-prod-us-central-0.grafana.net/otlp/v1/logs`
    - EU: `https://otlp-gateway-prod-eu-west-0.grafana.net/otlp/v1/logs`

### 2. GRAFANA_INSTANCE_ID
*   Your Loki/OTLP **Instance ID** (numeric).
*   Found in the OTLP or Loki configuration section.

### 3. GRAFANA_API_KEY
*   Generate an API Key (Access Policy Token) with **logs:write** scope.
*   Navigate to **Access Policies** → **Create Access Policy**.
*   Give it a name (e.g., `opencodehub-logger`).
*   Ensure it has scope/permission to `logs:write`.
*   Copy the generated token.

## Final Configuration

Update your `.env` file:

```bash
# Grafana Cloud OTLP Logging
GRAFANA_OTLP_ENDPOINT=https://otlp-gateway-prod-ap-south-1.grafana.net/otlp/v1/logs
GRAFANA_INSTANCE_ID=1273345
GRAFANA_API_KEY=your_long_api_key_token_here
```

Restart your application for changes to take effect:
```bash
bun run dev
```

## Viewing Logs in Grafana

1. Go to your Grafana Cloud dashboard
2. Navigate to **Explore** → Select **Loki** as the data source
3. Query logs with: `{service_name="opencodehub"}`
