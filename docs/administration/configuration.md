# Configuration Reference

OpenCodeHub is configured exclusively via environment variables.

## Core

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SITE_URL` | Public URL of the instance | Yes | `http://localhost:3000` |
| `PORT` | Port to listen on | No | `3000` |
| `NODE_ENV` | `development` or `production` | No | `development` |

## Security (Critical)

| Variable | Description | Generate With |
|----------|-------------|---------------|
| `JWT_SECRET` | Signs auth tokens | `openssl rand -hex 32` |
| `SESSION_SECRET` | Signs session cookies | `openssl rand -hex 32` |
| `INTERNAL_HOOK_SECRET` | Secures git hooks | `openssl rand -hex 32` |

## Database

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_DRIVER` | `postgres`, `mysql`, `sqlite`, `libsql` | `postgres` |
| `DATABASE_URL` | Connection string | `postgresql://user:pass@host:5432/db` |
| `DATABASE_AUTH_TOKEN`| Auth token (Turso/LibSQL only) | |

## Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `STORAGE_TYPE` | `local` (filesystem) or `s3` (any S3-compatible object store) | `local` |
| `STORAGE_PATH` | Path for local storage | `./data/storage` |
| `STORAGE_BUCKET` | Bucket name (required for `s3`) | |
| `STORAGE_REGION` | S3 region | `us-east-1` |
| `STORAGE_ENDPOINT` | Custom S3 endpoint (MinIO, R2, Garage, SeaweedFS, Ceph RGW, etc.) | |
| `STORAGE_ACCESS_KEY_ID` | S3 access key | |
| `STORAGE_SECRET_ACCESS_KEY` | S3 secret key | |

> Only `local` and `s3` storage backends are supported.  Previous releases
> also supported `gdrive`, `azure`, `gcs`, `dropbox`, `onedrive`, `ftp`, and
> an rclone-as-adapter option; these have been removed in favour of
> S3-compatible object storage.  See `docs/guides/storage-adapters.md`.

## AI Review

| Variable | Description |
|----------|-------------|
| `AI_PROVIDER` | `openai` or `anthropic` |
| `OPENAI_API_KEY` | OpenAI API Key |
| `ANTHROPIC_API_KEY` | Anthropic API Key |

## Email (SMTP)

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | Hostname (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | Port (e.g. `587`) |
| `SMTP_USER` | Username |
| `SMTP_PASSWORD`| Password |
| `SMTP_FROM` | From address |
