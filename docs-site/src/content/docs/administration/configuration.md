---
title: "Configuration Reference"
---

OpenCodeHub is configured via environment variables. Copy `.env.example` to `.env` and edit.

## Server

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Bind address | `0.0.0.0` |
| `PORT` | HTTP port | `4321` |
| `SITE_URL` | Public URL of the instance | `http://localhost:4321` |
| `APP_NAME` | Instance name | `OpenCodeHub` |
| `NODE_ENV` | `development` or `production` | `development` |

## Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_DRIVER` | `postgres`, `sqlite`, or `turso` (LibSQL) | `postgres` |
| `DATABASE_URL` | Connection string | — |
| `DATABASE_POOL_SIZE` | Connection pool size | `10` |
| `DATABASE_SSL` | Enable PostgreSQL SSL | `false` |
| `DATABASE_AUTH_TOKEN` | Auth token (Turso/LibSQL only) | — |

:::caution[Production]
PostgreSQL is **required** for production. All schemas use `pgTable`. SQLite is for development only.
:::

## Redis

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `REDIS_PASSWORD` | Redis password | — |

Redis is required in production for distributed locking, rate limiting, and sessions. For edge deployments (Vercel), use Upstash Redis with `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## Authentication

| Variable | Description | Generate With |
|----------|-------------|---------------|
| `JWT_SECRET` | Signs auth tokens | `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `SESSION_SECRET` | Signs session cookies | `openssl rand -base64 32` |

## Security Secrets

All secrets below must be unique. Generate each with `openssl rand -hex 32`.

| Variable | Purpose |
|----------|---------|
| `INTERNAL_HOOK_SECRET` | Secures git hook communication between Git server and app |
| `CRON_SECRET` | Protects cron endpoints (GC, mirror sync, notification digests) |
| `AI_CONFIG_ENCRYPTION_KEY` | Encrypts AI provider API keys at rest |
| `WORKFLOW_SECRET_ENCRYPTION_KEY` | Encrypts CI/CD workflow secrets at rest |
| `RUNNER_SECRET` | Shared secret between server and CI runners |
| `METRICS_TOKEN` | Bearer token for `GET /api/metrics` (Prometheus). Empty = public |

## OAuth Providers

| Variable | Description |
|----------|-------------|
| `OAUTH_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OAUTH_GITHUB_CLIENT_ID` | GitHub OAuth client ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |
| `OAUTH_GITLAB_CLIENT_ID` | GitLab OAuth client ID |
| `OAUTH_GITLAB_CLIENT_SECRET` | GitLab OAuth client secret |

OpenCodeHub also supports SSO via SAML and OIDC. Configure these through the admin dashboard.

## Git Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `GIT_REPOS_PATH` | Directory for git repositories | `./data/repositories` |
| `GIT_SSH_PORT` | SSH git server port | `2222` |
| `GIT_SSH_HOST_KEY` | Path to SSH host key | `./data/ssh/host_key` |

## Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `STORAGE_TYPE` | `local` or `s3` | `local` |
| `STORAGE_PATH` | Local storage path | `./data/storage` |

### S3-Compatible Storage

Works with AWS S3, MinIO, Cloudflare R2, Garage, SeaweedFS, Ceph RGW, Wasabi, Backblaze B2, and any S3-compatible service.

| Variable | Description |
|----------|-------------|
| `STORAGE_BUCKET` | Bucket name (required for S3) |
| `STORAGE_REGION` | S3 region (default: `us-east-1`) |
| `STORAGE_ENDPOINT` | Custom S3 endpoint (for MinIO, R2, etc.) |
| `STORAGE_ACCESS_KEY_ID` | S3 access key |
| `STORAGE_SECRET_ACCESS_KEY` | S3 secret key |

:::tip[Performance]
For best performance, use **local SSD storage**. Object storage (S3/R2) introduces latency. Use S3 for multi-node deployments or backup.
:::

## CI/CD Runner

| Variable | Description | Default |
|----------|-------------|---------|
| `RUNNER_ENABLED` | Enable the CI runner | `true` |
| `RUNNER_DOCKER_SOCKET` | Docker socket path | `/var/run/docker.sock` |
| `RUNNER_WORKSPACE_PATH` | Workspace directory | `./data/runner/workspaces` |
| `RUNNER_ARTIFACTS_PATH` | Artifacts directory | `./data/runner/artifacts` |
| `RUNNER_CONCURRENT_JOBS` | Max concurrent jobs | `2` |
| `RUNNER_TIMEOUT` | Job timeout in seconds | `3600` |
| `RUNNER_REGISTRATION_TOKEN_TTL_DAYS` | Token TTL | `90` |

## Email (SMTP)

| Variable | Description | Default |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP hostname | — |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASSWORD` | SMTP password | — |
| `SMTP_FROM` | From address | `noreply@opencodehub.local` |

## Logging

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Log file path | `./data/logs/opencodehub.log` |

## Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `RATE_LIMIT_ENABLED` | Enable rate limiting | `true` |
| `RATE_LIMIT_AUTH` | Auth endpoints (req/15min) | `5` |
| `RATE_LIMIT_API` | API endpoints (req/min) | `100` |
| `RATE_LIMIT_GIT` | Git operations (req/min) | `200` |
| `RATE_LIMIT_GENERAL` | General endpoints (req/min) | `60` |
| `RATE_LIMIT_SKIP_DEV` | Skip in development | `false` |
| `CSRF_SKIP_DEV` | Skip CSRF in development | `false` |

## CORS & Request Limits

| Variable | Description | Default |
|----------|-------------|---------|
| `ALLOWED_ORIGINS` | Comma-separated allowed origins | `http://localhost:4321` |
| `MAX_REQUEST_BODY_MB` | Max request body size (MB) | `10` |
| `MAX_PACK_SIZE_MB` | Max git pack size (MB) | `500` |
| `GIT_PROCESS_TIMEOUT_SECS` | Git process timeout (sec) | `300` |

## Feature Flags

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_REGISTRATION` | Allow new user signups | `true` |
| `ENABLE_WIKI` | Enable repository wikis | `true` |
| `ENABLE_ISSUES` | Enable issue tracking | `true` |
| `ENABLE_ACTIONS` | Enable CI/CD pipelines | `true` |
| `ENABLE_PACKAGES` | Enable package registry | `false` |
| `ENABLE_AI_ASSISTANT` | Enable AI code review | `true` |

## AI Providers

Configure one or more AI providers for code review. Keys are encrypted at rest using `AI_CONFIG_ENCRYPTION_KEY`.

| Variable | Provider |
|----------|----------|
| `OPENAI_API_KEY` | OpenAI (GPT-4, GPT-4o) |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `GROQ_API_KEY` | Groq (fast inference) |
| `BYTEZ_API_KEY` | Bytez |
| `OPENROUTER_API_KEY` | OpenRouter (multi-model) |
| `TOGETHER_API_KEY` | Together AI |
| `GOOGLE_AI_API_KEY` | Google AI (Gemini) |

Ollama is supported for local/self-hosted AI. No API key required — just set the Ollama endpoint in the admin dashboard.

## External Review Agent

| Variable | Description |
|----------|-------------|
| `EXTERNAL_AGENT_WEBHOOK_URL` | Webhook URL for external AI agent |
| `EXTERNAL_AGENT_API_KEY` | API key for the external agent |
| `EXTERNAL_AGENT_CALLBACK_SECRET` | Callback verification secret |

## Backup

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKUP_ENCRYPTION_KEY` | Encryption key for backups | — |
| `BACKUP_S3_BUCKET` | S3 bucket for backups | — |
| `BACKUP_S3_PREFIX` | S3 prefix | `opencodehub-backups` |
| `BACKUP_RETENTION_DAYS` | Retention period | `30` |
| `BACKUP_DIR` | Local backup directory | `./backups` |

## Air-gapped Mode

| Variable | Description | Default |
|----------|-------------|---------|
| `AIR_GAPPED_MODE` | Disable all external API calls | `false` |

When enabled, OpenCodeHub operates fully offline. AI features are disabled unless you run a local model (e.g., Ollama).

## Observability

| Variable | Description |
|----------|-------------|
| `GRAFANA_OTLP_ENDPOINT` | Grafana Cloud OTLP endpoint |
| `GRAFANA_INSTANCE_ID` | Grafana Cloud instance ID |
| `GRAFANA_API_KEY` | Grafana Cloud API key |

OpenCodeHub exports OpenTelemetry traces and Prometheus metrics. See [Monitoring](/administration/monitoring/) for setup details.
