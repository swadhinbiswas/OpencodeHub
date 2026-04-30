# System Architecture

OpenCodeHub is designed as a **modular monolith**: a single deployable application that can optionally run additional worker processes for background jobs and CI execution. This architecture provides simplicity for small deployments while supporting horizontal scaling for enterprise use cases.

---

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Request Flow](#request-flow)
- [Core Components](#core-components)
- [Database Layer](#database-layer)
- [Storage Layer](#storage-layer)
- [Git Protocol Handling](#git-protocol-handling)
- [CI/CD System](#cicd-system)
- [Security Architecture](#security-architecture)
- [Scaling Considerations](#scaling-considerations)
- [Directory Structure](#directory-structure)

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  Browser    │  Git CLI (HTTP)    │  Git CLI (SSH)    │  och CLI │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OPENCODEHUB PLATFORM                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Web UI     │  │  REST API   │  │  GraphQL Endpoint       │  │
│  │  (Astro +   │  │  (140+      │  │  (src/pages/api/        │  │
│  │   React)    │  │   routes)   │  │   graphql.ts)           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Git HTTP   │  │  SSH Server │  │  Pipeline Runner        │  │
│  │  Server     │  │  (ssh2)     │  │  (Docker executor)      │  │
│  │  (Smart     │  │             │  │                         │  │
│  │   Protocol) │  │             │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PERSISTENCE & INFRASTRUCTURE                        │
│  PostgreSQL/SQLite/Turso  │  Redis  │  Pluggable Storage        │
└─────────────────────────────────────────────────────────────────┘
```

### Runtime Processes

| Process | Command | Purpose | Required |
|---------|---------|---------|----------|
| **Main App** | `npm run dev` / `astro dev` | Web UI + API + Git HTTP | Yes |
| **SSH Git** | `npm run git:start` | SSH git push/pull server | Optional |
| **Worker** | `npm run worker:start` | Background jobs, queues, webhooks | Optional |
| **Runner** | `npm run runner:start` | CI/CD pipeline execution | Optional |

---

## Request Flow

### HTTP Request (Browser/API)

```
Browser/API Client
      │
      ▼
Astro Middleware (auth, rate limit, CSRF)
      │
      ▼
Route Handler (src/pages/api/*.ts)
      │
      ▼
Business Logic (src/lib/*.ts)
      │
      ▼
Database (src/db/index.ts -> Drizzle)
```

### Git Push/Pull (HTTP)

```
Git CLI
  │
  ▼
POST /git/{owner}/{repo}/git-receive-pack
  │
  ▼
src/lib/git-server.ts
  │
  ▼
Spawn git-upload-pack / git-receive-pack
  │
  ▼
Storage adapter (local/S3/etc.)
```

### Git Push/Pull (SSH)

```
Git CLI (ssh://)
  │
  ▼
ssh2 server (port 2222)
  │
  ▼
Public key authentication
  │
  ▼
Authorization check (permissions.ts)
  │
  ▼
Spawn git-upload-pack / git-receive-pack
```

---

## Core Components

### 1. Web UI (Astro + React)

The frontend is built with Astro 4.x in SSR mode with the Node standalone adapter.

- **Astro pages**: File-based routing in `src/pages/`
- **React components**: Interactive UI components in `src/components/`
- **Tailwind CSS**: Utility-first styling
- **Radix UI**: Accessible UI primitives

Key pages:
- `[owner]/[repo]/` — Repository browser, issues, PRs
- `[owner]/[repo]/pulls/` — Pull request management
- `[owner]/[repo]/issues/` — Issue tracking
- `admin/` — Admin dashboard
- `api/` — REST API routes

### 2. REST API

140+ API routes organized by domain:

```
src/pages/api/
├── auth/           # Login, register, OAuth, 2FA
├── repos/          # Repository CRUD, git endpoints
├── actions/        # CI/CD pipeline APIs
├── admin/          # Admin endpoints
├── user/           # User settings, PATs
├── stacks/         # Stacked PR APIs
├── graphql.ts      # GraphQL endpoint
└── openapi.json.ts # OpenAPI spec endpoint
```

### 3. Git HTTP Server

Implements the Git Smart HTTP protocol:

- **Info/refs**: `GET /git/{owner}/{repo}/info/refs?service=git-upload-pack`
- **Upload pack**: `POST /git/{owner}/{repo}/git-upload-pack` (clone/fetch)
- **Receive pack**: `POST /git/{owner}/{repo}/git-receive-pack` (push)

Uses native `git` CLI via child process spawning with:
- Pack size limits (`MAX_PACK_SIZE_MB`, default 500MB)
- Process timeouts (`GIT_PROCESS_TIMEOUT_SECS`, default 300s)
- Sideband protocol for progress reporting

Implementation: `src/lib/git-server.ts`

### 4. SSH Server

Dedicated SSH server for Git operations:

- **Port**: 2222 (configurable via `GIT_SSH_PORT`)
- **Authentication**: Public key against `deployKeys` table
- **Authorization**: Checks repository permissions
- **Rate limiting**: Per-IP failure tracking with automatic blocking
- **Host key**: Auto-generated RSA 4096-bit key at `GIT_SSH_HOST_KEY`

Implementation: `src/lib/ssh.ts`

---

## Database Layer

### Drizzle ORM

OpenCodeHub uses Drizzle ORM with a multi-driver factory pattern:

```typescript
// src/db/index.ts
export function getDatabase() {
  const driver = process.env.DATABASE_DRIVER || "postgres";
  
  if (driver === "postgres") {
    // PostgreSQL with pg driver
    return drizzlePg(pool, { schema });
  }
  
  if (driver === "libsql" || driver === "turso") {
    // Turso/LibSQL for edge deployments
    return drizzleLibSQL(client, { schema });
  }
  
  // SQLite fallback for development
  return drizzle(sqlite, { schema });
}
```

### Schema (38 Tables)

| Category | Tables |
|----------|--------|
| **Core** | users, repositories, organizations, teams, roles |
| **Git & Collaboration** | pullRequests, prStacks, prStackEntries, mergeQueue, mergeQueueSpeculativeRuns, branchProtection, reviewRequirements, requiredStatusChecks |
| **Issues & Projects** | issues, projects, milestones, labels, wiki |
| **CI/CD** | workflows, workflowRuns, workflowJobs, workflowSteps, pipelineRunners, externalCIConfigs, externalBuilds |
| **Security & Access** | personalAccessTokens, deployKeys, securityPolicies, pathPermissions |
| **Integrations** | webhooks, automations, slackIntegration, sso |
| **AI & Quality** | aiReviews, aiReviewRules, developerMetrics |

---

## Storage Layer

All blob storage goes through an abstract `StorageAdapter` class:

```
StorageAdapter (abstract)
├── LocalStorageAdapter      # Filesystem
├── S3StorageAdapter         # S3, MinIO, R2
├── GCSStorageAdapter        # Google Cloud Storage
├── AzureStorageAdapter      # Azure Blob
├── GoogleDriveStorageAdapter # Google Drive
├── OneDriveStorageAdapter   # Microsoft OneDrive
├── DropboxStorageAdapter    # Dropbox
└── RcloneStorageAdapter     # Any rclone remote
```

### Configuration

Set `STORAGE_DRIVER` environment variable:

| Driver | Required Env Vars |
|--------|-------------------|
| `local` | `STORAGE_PATH` |
| `s3` | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` |
| `gcs` | `GCS_BUCKET`, `GCS_PROJECT_ID`, `GCS_KEY_FILE` |
| `azure` | `AZURE_ACCOUNT_NAME`, `AZURE_ACCOUNT_KEY`, `AZURE_CONTAINER_NAME` |
| `gdrive` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| `rclone` | `STORAGE_RCLONE_REMOTE` |

---

## Git Protocol Handling

### Smart HTTP Protocol

Full implementation of the Git Smart HTTP protocol:

1. **Discovery**: Client requests `info/refs` with service name
2. **Advertisement**: Server returns ref advertisements in pkt-line format
3. **Negotiation**: Client and server negotiate objects to transfer
4. **Transfer**: Packfile transfer with sideband multiplexing

### SSH Protocol

Standard Git-over-SSH with custom authentication:

1. **Connection**: SSH client connects to port 2222
2. **Auth**: Server verifies public key against `deployKeys` table
3. **Command parsing**: Extracts `git-upload-pack` or `git-receive-pack`
4. **Authorization**: Checks user has read/write permission
5. **Execution**: Spawns git process with validated repo path

### Storage Backends for Git Objects

Git objects can be stored in:
- **Local filesystem**: Traditional `.git/objects` directory
- **Object storage**: Custom packfile storage in S3/GCS/Azure
- **Hybrid**: Local for hot objects, cloud for archived packs

---

## CI/CD System

### Pipeline Engine

GitHub Actions-compatible workflow engine:

1. **Trigger**: Push, PR, schedule, or manual dispatch
2. **Parse**: Reads `.github/workflows/*.yml`
3. **Match**: Determines which workflows match the event
4. **Queue**: Jobs placed in BullMQ + Redis
5. **Execute**: Runner picks up jobs and runs in Docker containers
6. **Report**: Logs and status streamed back to web UI

### Runner Architecture

```
Runner Process
  │
  ├── Dockerode client
  │     └── Connects to Docker daemon
  │
  ├── Job execution
  │     ├── Clone repository
  │     ├── Parse workflow
  │     ├── Run steps in containers
  │     └── Collect artifacts
  │
  └── Log streaming
        └── Redis pub/sub -> Web UI
```

### Container Isolation

Each job runs in an isolated Docker container with:
- Memory limits (default 2GB)
- CPU limits (default 2 cores)
- Process limits (default 1024 PIDs)
- Capability dropping (no `SYS_ADMIN`, `NET_ADMIN`)
- No privileged mode

---

## Security Architecture

### Authentication Layers

| Layer | Method | Use Case |
|-------|--------|----------|
| **Web Sessions** | Cookie-based JWT (`och_session`) | Browser users |
| **API Tokens** | Bearer JWT or PAT (`och_...`) | API clients, CLI |
| **Git HTTP** | Basic auth with PAT as password | Git CLI over HTTP |
| **Git SSH** | Public key auth | Git CLI over SSH |
| **Webhooks** | HMAC signature + secret | Inbound webhook verification |

### Middleware Pipeline

```
Request
  │
  ▼
Rate Limiting (per-endpoint tiers)
  │
  ▼
Authentication (JWT/PAT validation)
  │
  ▼
CSRF Protection (state-changing requests)
  │
  ▼
Authorization (RBAC check)
  │
  ▼
Route Handler
```

### Data Protection

- **Passwords**: bcrypt with 12 rounds
- **2FA Secrets**: TOTP (RFC 6238) via otplib
- **Workflow Secrets**: AES-256-GCM encryption at rest
- **AI Config**: AES-256-GCM encryption for API keys
- **Sessions**: HttpOnly, Secure, SameSite=Lax cookies
- **PATs**: Hashed with SHA-256 before storage

---

## Scaling Considerations

### Vertical Scaling

The monolith can scale vertically by:
- Increasing CPU/RAM for the main process
- Using faster storage (SSD/NVMe)
- Tuning PostgreSQL connection pool

### Horizontal Scaling

For multi-node deployments:

1. **Load Balancer**: Distribute HTTP traffic
2. **Shared Database**: PostgreSQL with read replicas
3. **Shared Redis**: For sessions, queues, rate limiting
4. **Shared Storage**: S3/GCS instead of local filesystem
5. **Worker Processes**: Run workers on separate nodes
6. **Runner Pool**: Multiple CI runners

### Statelessness

The application is designed to be stateless:
- All session data in Redis
- All file data in external storage
- Git operations spawn external processes
- No in-memory caching of user data

### Known Limitations

| Limitation | Mitigation |
|------------|------------|
| Single-node merge queue | Use Redis for distributed locking |
| Local git repos | Use shared NFS or object storage |
| SQLite | Switch to PostgreSQL for multi-node |

---

## Directory Structure

```
/home/swadhin/owngit/OpenCodeHub/
├── src/                          # MAIN APPLICATION
│   ├── pages/                    # Astro file-based routing
│   │   ├── api/                  # REST API routes (140+ files)
│   │   ├── [owner]/[repo]/       # Repository pages
│   │   ├── admin/                # Admin dashboard
│   │   ├── git/                  # Git HTTP protocol endpoints
│   │   └── ...                   # Other pages
│   ├── lib/                      # Core business logic (120+ modules)
│   │   ├── auth.ts               # JWT, sessions, password hashing
│   │   ├── git-server.ts         # Git HTTP RPC
│   │   ├── ssh.ts                # SSH git server
│   │   ├── storage.ts            # Pluggable storage adapters
│   │   ├── pipeline.ts           # CI/CD workflow engine
│   │   ├── stacks.ts             # Stacked PR core logic
│   │   ├── merge-queue.ts        # Merge queue
│   │   ├── pull-requests.ts      # PR CRUD and merge
│   │   ├── permissions.ts        # RBAC and access control
│   │   ├── webhooks.ts           # Outbound webhook delivery
│   │   ├── automations.ts        # Workflow automation
│   │   ├── ai-review.ts          # AI-powered code review
│   │   └── validation.ts         # Input validation (Zod)
│   ├── db/                       # Database layer
│   │   ├── index.ts              # DB connection factory
│   │   ├── schema/               # Drizzle schema (38 tables)
│   │   └── adapter/              # DB adapter factory
│   ├── components/               # React components
│   ├── middleware.ts             # Global middleware
│   ├── middleware/               # Middleware modules
│   └── runner/                   # CI runner (in-app)
│
├── cli/                          # CLI package
│   └── src/
│       ├── commands/             # CLI command groups (20+)
│       └── lib/                  # CLI utilities
│
├── packages/                     # Additional packages
│   ├── git-rpc-daemon/
│   ├── merge-queue-daemon/
│   ├── ci-runner/
│   └── sdk/
│
├── docs/                         # Documentation
├── docs-site/                    # Documentation website
├── scripts/                      # Utility scripts
├── docker-compose.yml            # Docker Compose setup
├── Dockerfile                    # Main app container
└── package.json
```

---

## Extension Points

| Extension | How to Extend |
|-----------|---------------|
| **Storage backends** | Extend `StorageAdapter` in `src/lib/storage.ts` |
| **Database drivers** | Add case in `src/db/index.ts` factory |
| **API routes** | Add files to `src/pages/api/` |
| **CLI commands** | Add command groups to `cli/src/commands/` |
| **Webhooks** | Register in repo settings, handled by `src/lib/webhooks.ts` |
| **CI actions** | Place `.github/workflows/*.yml` in repo |
| **Auth providers** | Add OAuth config in `src/lib/oauth.ts` |

---

## Related Documentation

- [Database Schema](database-schema.md)
- [Contributing](contributing.md)
- [Testing](testing.md)
- [Deployment Guide](../administration/deployment.md)
- [Security Best Practices](../administration/security.md)
