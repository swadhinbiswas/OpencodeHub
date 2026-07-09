---
title: Deployment Compatibility Matrix
---

# Deployment Compatibility Matrix

OpenCodeHub supports multiple deployment configurations. This document maps features to deployment modes.

## Supported Deployment Modes

| Mode | Description | Recommended For | Status |
|---|---|---|---|
| **Single-Node (Docker)** | Docker Compose on one VM | Small teams (<50 users), self-hosted | ✅ Production-ready |
| **Single-Node (Bare Metal)** | Direct Node.js on one server | Air-gapped, minimal cloud | ✅ Production-ready |
| **Multi-Node (K8s)** | Helm chart on Kubernetes | Teams of any size, HA | ✅ Production-ready |

## Feature Compatibility by Mode

| Feature | Single-Node (Docker) | Multi-Node (K8s) | Air-Gapped |
|---|---|---|---|
| Git over SSH | ✅ | ✅ | ✅ |
| Git over HTTPS | ✅ | ✅ | ✅ |
| CI/CD Runners | ✅ | ✅ | ✅ |
| Merge Queues | ✅ | ✅ | ✅ |
| Real-time (SSE) | ✅ | ✅ | ✅ |
| Rate Limiting (Redis) | ✅ | ✅ | ⚠️ |
| AI Code Review | ✅ | ✅ | ⚠️ |
| Object Storage (S3) | ✅ | ✅ | ✅ |
| Email Notifications | ✅ | ✅ | ✅ |
| Slack Notifications | ✅ | ✅ | ✅ |
| Prometheus Metrics | ✅ | ✅ | ✅ |
| OTLP Logging | ✅ | ✅ | ⚠️ |
| Webhook Events | ✅ | ✅ | ✅ |
| LFS (Large Files) | ✅ | ✅ | ✅ |
| Database: PostgreSQL | ✅ | ✅ | ✅ |
| Database: MySQL | ✅ | ✅ | ✅ |
| Database: SQLite | ✅ | ❌ | ✅ |
| Database: Turso/LibSQL | ✅ | ✅ | ✅ |
| Backup & Restore | ✅ | ✅ | ✅ |
| Horizontal Scaling | ❌ | ✅ | ✅ |

Legend: ✅ Supported, ⚠️ Partial/Config needed, ❌ Not supported

## Database Driver Support

| Driver | Docker | Kubernetes | Bare Metal | Notes |
|---|---|---|---|---|
| PostgreSQL | ✅ | ✅ | ✅ | Recommended for production |
| MySQL / MariaDB | ✅ | ✅ | ✅ | Supported |
| SQLite | ✅ | ❌ | ✅ | Single-node only |
| Turso / LibSQL | ✅ | ✅ | ✅ | Edge-friendly |
| PlanetScale | ⚠️ | ⚠️ | ⚠️ | Serverless branching not supported |
| Supabase | ⚠️ | ⚠️ | ⚠️ | Use PostgreSQL driver |
| Neon | ⚠️ | ⚠️ | ⚠️ | Branching/PCS not supported |

## Object Storage Support

| Adapter | Docker | Kubernetes | Air-Gapped |
|---|---|---|---|
| **Local disk** | ✅ | ✅ | ✅ | ✅ Default |
| **S3-compatible** | ✅ | ✅ | ✅ | ❌ |
| **Backblaze B2** | ✅ | ✅ | ⚠️ | ❌ |

## Network & Security

| Requirement | Single-Node | Multi-Node | Notes |
|---|---|---|---|
| TLS/SSL termination | ✅ | ✅ | Proxy handles it |
| Internal TLS | ❌ | ⚠️ | Planned |
| mTLS for runners | ❌ | ⚠️ | Planned |
| Network policies (K8s) | N/A | ✅ | Helm optional template |
| Secret encryption at rest | ✅ | ✅ | AES-256-GCM |
| Audit log encryption | ✅ | ✅ | AES-256-GCM |

## Horizontal Scaling Notes

### What works in multi-instance mode
- Web/API requests (stateless, Redis-backed sessions)
- Merge queue (distributed locks via Redis)
- Rate limiting (Redis-based)
- CI job queue (BullMQ + Redis)
- Cache (Redis)
- Webhooks (stateless)
- Git operations (NFS/shared storage required)

### What requires shared storage
- Repository git data (must be on shared FS or S3)
- LFS objects (must be on shared FS or S3)
- CI artifacts (must be on shared FS or S3)
- Database (must be a networked DB, not SQLite)

### What needs sticky sessions
- None — fully stateless

## Environment Variables by Mode

### All Modes (Required)
```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=<32+ byte random>
WORKFLOW_SECRET_ENCRYPTION_KEY=<32+ hex chars>
SITE_URL=https://your-domain.com
```

### Redis (Required for Multi-Node)
```bash
REDIS_URL=redis://host:6379
```

### Object Storage (Required for S3)
```bash
STORAGE_TYPE=s3
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_REGION=us-east-1
STORAGE_BUCKET=opencodehub-storage
```

### Email (Optional)
```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM=noreply@your-domain.com
```

### AI Providers (Optional)
```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
# or for local:
AI_PROVIDER=local
LOCAL_BASE_URL=http://localhost:11434
LOCAL_API_KEY=ollama-key
```

## Quick Start by Mode

### Docker (Single-Node)
```bash
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub
cp .env.example .env
# Edit .env with your values
docker compose -f docker-compose.production.yml up -d
```

### Kubernetes (Multi-Node)
```bash
helm repo add opencodehub https://charts.opencodehub.dev
helm repo update
helm install opencodehub opencodehub/opencodehub \
  --values values.yaml \
  --namespace opencodehub \
  --create-namespace
```

### Air-Gapped
```bash
# Build image locally from Dockerfile
docker build -t opencodehub:local .
# Use local storage adapter
STORAGE_ADAPTER=local
# Use SQLite
DATABASE_URL=file:/data/opencodehub.db
DATABASE_DRIVER=sqlite
```