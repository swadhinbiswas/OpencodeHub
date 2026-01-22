---
title: "Observability"
description: "Tracing, metrics, and logging for OpenCodeHub."
---

OpenCodeHub ships with built‑in metrics and optional OpenTelemetry tracing.

## Metrics (Prometheus)

The server exposes Prometheus‑compatible metrics via:

- `GET /api/metrics`

Default metrics include HTTP duration and active runner counts.

## Tracing (OpenTelemetry)

Enable tracing by setting:

```bash
ENABLE_TRACING=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

The system uses the OpenTelemetry Node SDK and auto‑instrumentations to emit traces.

## Logging

Server logs are emitted using `pino`. In development, use `pino-pretty` or your preferred log formatter.
