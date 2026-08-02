# Horizontal Scaling

OpenCodeHub is designed to be scaled horizontally to handle high traffic and large workloads.

## Stateless Application Servers
The main Astro application and REST API endpoints are mostly stateless. You can run multiple instances of the app behind a load balancer (e.g., Nginx, HAProxy, or a cloud LB).

## State Management
- **Database**: Ensure your database (PostgreSQL) is appropriately scaled or managed (e.g., AWS RDS).
- **Redis**: Redis is strictly required for horizontal scaling. It handles sessions, rate limiting, distributed locking, and BullMQ queues for the background workers.
- **Background Workers**: You can spin up multiple worker processes (`npm run worker:start`) across different nodes. They will pull jobs from the shared Redis queue.

## Shared Git Storage
To allow multiple app instances to access Git repositories over SSH and HTTP, the `GIT_REPOS_PATH` must point to a shared network file system (e.g., NFS, EFS) that supports POSIX file locking.

## Pluggable Blob Storage
Configure `STORAGE_TYPE=s3` and use an S3-compatible backend (MinIO, AWS S3, Cloudflare R2) so all nodes share access to the same artifact/LFS storage.
