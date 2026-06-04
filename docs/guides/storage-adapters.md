---
title: "Storage Adapters"
slug: "guides/storage-adapters"
---

# Storage Adapters

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

Data is written under the directory pointed to by `STORAGE_PATH`
(default `./data/storage`). A `.meta` sidecar file is written next to
each uploaded blob to persist content-type metadata.

```env
STORAGE_TYPE=local
STORAGE_PATH=./data/storage
```

**When to choose local:** single-server deployments, self-hosting on a
home server or NAS, development, and CI runners that do not need
distributed blob storage.

---

## ☁️ S3-compatible storage

The `s3` driver speaks the S3 v4 API. Any vendor that implements it
works by setting `STORAGE_ENDPOINT` to the vendor's endpoint URL and
`STORAGE_REGION` to its documented region string. Path-style addressing
is enabled automatically when an endpoint is provided, which is required
by MinIO, Garage, SeaweedFS, and most self-hosted stacks.

### Common configuration

```env
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=                 # leave empty for AWS S3
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
```

### Preset configurations

#### AWS S3 (managed)

```env
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

```env
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

```env
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

```env
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

```env
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

```env
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

```env
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

## Performance considerations

- **Multipart uploads.** OpenCodeHub uploads blobs in 5 MiB parts with
  four parts in flight (`@aws-sdk/lib-storage`). Tunable in
  `src/lib/storage.ts:S3StorageAdapter.writeStream`.
- **Signed URLs.** When `STORAGE_TYPE=s3`, LFS and the storage proxy
  issue real S3 presigned URLs (V4) for client-side download/upload,
  offloading bandwidth from the OpenCodeHub process. When
  `STORAGE_TYPE=local`, the proxy streams blobs through the
  OpenCodeHub HTTP server with an HMAC signature check.
- **Disk vs. network.** Local storage is bounded by the host disk I/O;
  S3 storage is bounded by the upstream link. For a home server with
  gigabit uplink, S3 to R2 or MinIO on a second NAS box is often
  faster than writing to the same disk that hosts the database.

## Migration

```bash
# local -> S3: stream every blob under STORAGE_PATH into the bucket
aws s3 sync ./data/storage s3://opencodehub/ --endpoint-url $STORAGE_ENDPOINT

# S3 -> local: reverse
aws s3 sync s3://opencodehub/ ./data/storage --endpoint-url $STORAGE_ENDPOINT

# Then flip STORAGE_TYPE and restart.
```

## Disaster recovery

The `scripts/sync-storage.ts` module (and the `/api/admin/sync`
endpoint) can stream a copy of the storage root to any rclone-supported
target (S3 to a different bucket, B2, an SFTP server, an external
USB drive mounted on the host, etc.). It is orthogonal to the
primary storage driver and can be scheduled via cron. See
`docs/administration/backup-recovery.md` for the cron template.
