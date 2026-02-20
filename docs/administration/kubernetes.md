# Kubernetes Deployment (Helm)

OpenCodeHub ships with a production-ready Helm chart at:

- `deploy/helm/opencodehub`

## Quick Start

1. Build and publish your application image.
2. Create a values override file with secrets and ingress settings.
3. Install with Helm:

```bash
helm upgrade --install opencodehub ./deploy/helm/opencodehub -f values-prod.yaml
```

## Required Secret Values

Set these in `values-prod.yaml` under `envSecrets`:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `SERVER_URL`
- `INTERNAL_HOOK_SECRET`
- `RUNNER_SECRET`

## Included Resources

- Web deployment with configurable security context, probes, affinity/tolerations, topology spread, and HPA.
- Optional dedicated worker deployment with independent scaling controls.
- Optional service account and network policy resources.
- Optional ingress and persistent `/data` volume.
- Optional chart-managed secret or external secret reference (`envSecrets.existingSecretName`).

## Production Notes

- Use managed PostgreSQL and Redis outside the chart.
- Keep `REDIS_URL` configured for multi-instance safety (distributed locks and rate limits).
- Enable `networkPolicy.enabled=true` in restricted environments.
