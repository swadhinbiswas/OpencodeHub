---
title: "Storage Adapters"
---

OpenCodeHub stores git objects, LFS files, package-registry blobs (npm/OCI),
and any artifacts produced by the platform on a pluggable storage backend.
Two backends are supported:

- **`local`** — the server's filesystem. The default. Suitable for
  single-host deployments and for development.
- **`s3`** — any S3-compatible object store. The same code path serves
  AWS S3, MinIO, Cloudflare R2, Garage, SeaweedFS, Ceph RGW, Wasabi,
  Backblaze B2, and any other S3-v4 implementation.

> **Removed backends.** Previous releases also supported Google Drive,
> Microsoft OneDrive, Dropbox, FTP, Google Cloud Storage, Azure Blob
> Storage, and an rclone-as-adapter option. They were removed because
> none of them support the S3-style multipart semantics OpenCodeHub
> needs for efficient large-blob operations; rclone as a backup target
> remains as a separate, optional utility (`/api/admin/sync`,
> `scripts/sync-storage.ts`).

---

## 📂 Local storage (default)

Data is written under the directory pointed to by `DATA_DIR` (e.g., `/data/storage`). A `.meta` sidecar file is written next to each uploaded blob to persist content-type metadata.

```bash
STORAGE_TYPE=local
# If using the 1-click install, DATA_DIR handles this automatically.
# Otherwise, manually set:
DATA_DIR=./data
# (Which internally resolves STORAGE_PATH to ./data/storage)
```

**When to choose local:** single-server deployments, self-hosting on a home server or NAS, development, and CI runners that do not need distributed blob storage.

---

## ☁️ S3-compatible storage

The `s3` driver speaks the S3 v4 API. Any vendor that implements it
works by setting `STORAGE_ENDPOINT` to the vendor's endpoint URL and
`STORAGE_REGION` to its documented region string. Path-style addressing
is enabled automatically when an endpoint is provided, which is required
by MinIO, Garage, SeaweedFS, and most self-hosted stacks.

### Common configuration

```bash
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=                 # leave empty for AWS S3
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
```

### Preset configurations

#### AWS S3 (managed)

```bash
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub
STORAGE_REGION=us-east-1
# STORAGE_ENDPOINT left empty
STORAGE_ACCESS_KEY_ID=AKIA...
STORAGE_SECRET_ACCESS_KEY=...
```

Create the bucket and an IAM user with `s3:ListBucket`, `s3:GetObject`,
`s3:PutObject`, `s3:DeleteObject`, and `s3:GetObjectVersion`
permissions. Enable bucket versioning for cheap backups.

#### MinIO (self-hosted)

MinIO is the most popular S3-compatible server; it works as a drop-in
replacement for AWS S3 and is easy to run on a NAS, home server, or
Kubernetes cluster.

```bash
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=http://minio.local:9000
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_SECRET_ACCESS_KEY=minioadmin
```

The bundled `docker-compose.yml` includes a MinIO service under the
`with-minio` profile:

```bash
docker compose --profile with-minio up -d
```

The MinIO web console is exposed on `:9001`; create the bucket
`opencodehub` and an access key before starting the app.

#### Cloudflare R2

R2 is S3-compatible, has zero egress fees, and is well-suited to
self-hosters who already use Cloudflare for DNS / Tunnel.

```bash
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
```

Create an R2 API token with **Object Read & Write** scope on the bucket
in the Cloudflare dashboard.

#### Garage (self-hosted, lightweight)

[Garage](https://garagehq.deuxfleurs.fr/) is an S3-compatible
distributed object store designed for home labs and small clusters.
It's lighter than MinIO and well suited to multi-NAS setups.

```bash
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub
STORAGE_REGION=garage
STORAGE_ENDPOINT=http://garage.local:3900
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
```

#### SeaweedFS (self-hosted, very lightweight)

[SeaweedFS](https://github.com/seaweedfs/seaweedfs) is an S3-compatible
distributed object store optimised for small files; great for NAS
deployments where every byte counts.

```bash
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=http://seaweedfs.local:8333
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
```

#### Ceph RGW (S3 gateway)

If you already run Ceph for block or file storage, the RADOS Gateway
provides a fully S3-compatible HTTP frontend.

```bash
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub
STORAGE_REGION=default
STORAGE_ENDPOINT=https://rgw.example.com
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
```

#### Wasabi, Backblaze B2, DigitalOcean Spaces

All expose an S3-compatible endpoint. Use the S3 access key the vendor
issues and the endpoint URL it documents.

```bash
# Wasabi
STORAGE_ENDPOINT=https://s3.wasabisys.com
STORAGE_REGION=us-east-1

# Backblaze B2 (S3-compatible API)
STORAGE_ENDPOINT=https://s3.<region>.backblazeb2.com
STORAGE_REGION=us-west-004

# DigitalOcean Spaces
STORAGE_ENDPOINT=https://<region>.digitaloceanspaces.com
STORAGE_REGION=nyc3
```

---

## ⚠️ Performance Considerations

:::caution[Important for Production]
Object storage (S3/R2/MinIO) introduces **significant latency** compared to local disk storage for serving live git traffic. This is a fundamental architectural trade-off you should understand before deploying.
:::

### Latency Comparison

| Operation               | Local SSD | S3/R2 Object Storage |
| ----------------------- | --------- | -------------------- |
| Repository page load    | ~50-100ms | **5-30 seconds**     |
| Clone (small repo)      | ~100ms    | **2-10 seconds**     |
| Push (10 files)         | ~200ms    | **1-5 seconds**      |
| File browser navigation | ~30ms     | **500ms-2s**         |

### Why Does This Happen?

When using object storage, every Git operation requires **multiple HTTP requests**:

1. **List objects** - 1 API call
2. **Download each file** - 40+ API calls for a typical repo
3. **Each request has ~50-100ms latency** (network + S3 processing)

A repository page load might download:

- `HEAD`, `config`, `refs/heads/*` (branch info)
- `objects/pack/*.idx`, `*.pack` (git objects)
- All hook files, info files, etc.

**40 files × 100ms = 4+ seconds minimum**

### Recommendations by Use Case

#### 🏢 Production (Self-Hosted)

**Best:** Local SSD storage + S3 for backups only

```bash
STORAGE_TYPE=local
STORAGE_PATH=/var/lib/opencodehub/repos
```

Use a cron job or background process to sync to S3 for disaster recovery.

#### ☁️ Serverless (Vercel, Cloudflare Workers)

**Trade-off:** Accept latency or implement caching

```bash
STORAGE_TYPE=s3
# Enable local cache (coming soon)
ENABLE_REPO_CACHE=true
CACHE_TTL_SECONDS=300
```

### How GitHub/GitLab Solve This

| Company       | Approach                                          |
| ------------- | ------------------------------------------------- |
| **GitHub**    | Repos on local NVMe clusters, S3 for backups only |
| **GitLab**    | Gitaly (dedicated Git servers with local storage) |
| **Bitbucket** | Sharded storage servers, repos cached in memory   |

**Key insight:** Major Git hosts never serve live traffic from object storage. They use local disk + memory caching for hot repos.

### Future Improvements (Roadmap)

We're working on:

- **Local disk cache** with TTL-based invalidation
- **Parallel S3 downloads** (70% faster initial loads)
- **Redis metadata cache** (instant branch/tree info)
- **Gitaly-like architecture** for enterprise deployments

---

## 🔄 Migrating Between Storage Types

To migrate from local to S3:

```bash
# 1. Backup current repos
tar -czf repos-backup.tar.gz data/repos/

# 2. Upload to S3
aws s3 sync data/repos/ s3://your-bucket/repos/ --endpoint-url $STORAGE_ENDPOINT

# 3. Update .env
STORAGE_TYPE=s3
STORAGE_BUCKET=your-bucket

# 4. Clear local cache
rm -rf .tmp/repos/
```

To migrate from S3 to local:

```bash
# 1. Download from S3
aws s3 sync s3://your-bucket/repos/ data/repos/ --endpoint-url $STORAGE_ENDPOINT

# 2. Update .env
STORAGE_TYPE=local
STORAGE_PATH=./data/repos
```
