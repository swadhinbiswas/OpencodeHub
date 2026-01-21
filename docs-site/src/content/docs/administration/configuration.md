---
title: "Configuration Reference"
---


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
| `STORAGE_TYPE` | `local`, `s3`, `gdrive`, `azure` | `local` |
| `STORAGE_PATH` | Path for local storage | `./data` |
| `STORAGE_BUCKET` | Bucket name (S3/GCP) | |
| `STORAGE_REGION` | AWS Region | `us-east-1` |
| `STORAGE_ENDPOINT` | Custom S3 endpoint | |
| `S3_ACCESS_KEY` | AWS Access Key | |
| `S3_SECRET_KEY` | AWS Secret Key | |

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
