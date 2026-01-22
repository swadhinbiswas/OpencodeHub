---
title: "Storage Adapters"
---

OpenCodeHub supports a pluggable storage system, allowing you to store repository data (git objects, LFS files, artifacts) on various backends.

## Supported Adapters

- **Local Filesystem**: Default, stores data on the server's disk.
- **S3 Compatible**: AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces.
- **Google Drive**: Ideal for personal/low-cost deployments.
- **Azure Blob Storage**: Microsoft Azure storage.

---

## 📂 Local Storage (Default)

Data is stored in the `data/` directory relative to the application root.

**Configuration:**

```bash
STORAGE_TYPE=local
STORAGE_PATH=./data/storage  # Optional, default is ./data
```

---

## ☁️ S3 Compatible Storage

Store data in any S3-compatible bucket. This is recommended for production scalablity.

**Configuration:**

```bash
STORAGE_TYPE=s3
STORAGE_BUCKET=my-opencodehub-bucket
STORAGE_REGION=us-east-1      # or auto
STORAGE_ENDPOINT=https://s3.amazonaws.com # or your custom endpoint
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
```

### Examples

**MinIO (Self-hosted):**

```bash
STORAGE_ENDPOINT=http://minio:9000
STORAGE_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
```

**Cloudflare R2:**

```bash
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_REGION=auto
```

---

## 🚗 Google Drive Stack

This stack is ideal for cost-effective, serverless-style deployments where you want to minimize persistent volume usage.

### Prerequisites

1.  **Google Cloud Project**: Enable **Google Drive API**.
2.  **OAuth Credentials**: Create "Web Application" credentials.
3.  **Refresh Token**: Obtain a long-lived refresh token (e.g., via OAuth Playground).

### Configuration

```bash
STORAGE_TYPE=gdrive
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GOOGLE_FOLDER_ID=your-folder-id
```

**How to get Credentials:**

1.  Go to [Google Cloud Console](https://console.cloud.google.com).
2.  Create a project -> Enable **Google Drive API**.
3.  Create **OAuth Client ID**.
4.  Get Refresh Token via [OAuth Playground](https://developers.google.com/oauthplayground) with scope `https://www.googleapis.com/auth/drive.file`.

---

## 🔷 Azure Blob Storage

**Configuration:**

```bash
STORAGE_TYPE=azure
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_CONTAINER_NAME=opencodehub
```

---

## ⚠️ Performance Considerations

:::caution[Important for Production]
Object storage (S3/R2/MinIO) introduces **significant latency** compared to local disk storage. This is a fundamental architectural trade-off you should understand before deploying.
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

#### 💰 Budget-Conscious (Google Drive)

**Trade-off:** Slower but very cheap

```bash
STORAGE_TYPE=gdrive
```

Google Drive has similar latency characteristics to S3.

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
aws s3 sync data/repos/ s3://your-bucket/repos/

# 3. Update .env
STORAGE_TYPE=s3
STORAGE_BUCKET=your-bucket

# 4. Clear local cache
rm -rf .tmp/repos/
```

To migrate from S3 to local:

```bash
# 1. Download from S3
aws s3 sync s3://your-bucket/repos/ data/repos/

# 2. Update .env
STORAGE_TYPE=local
STORAGE_PATH=./data/repos
```
