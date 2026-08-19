---
title: "Backup and Restore"
---

# Backup and Restore

This guide covers how to back up and restore an OpenCodeHub instance.

## Backup Strategy

### 1. Database
For PostgreSQL, use `pg_dump`:
```bash
pg_dump -U opencodehub -d opencodehub_db > opencodehub_backup.sql
```

### 2. Git Repositories
The Git repositories are stored in the path defined by `GIT_REPOS_PATH` (default: `./data/repos`).
You can back this up using `rsync` or `tar`:
```bash
tar -czvf repos_backup.tar.gz ./data/repos/
```

### 3. Object Storage
If you are using S3 or another object storage provider for artifacts, ensure you have enabled versioning and standard bucket backups through your cloud provider. If using local storage, back up the configured `./data/storage` directory.

## Restore Strategy
To restore:
1. Stop the application and worker processes.
2. Restore the database using `psql`.
3. Extract the Git repositories to `GIT_REPOS_PATH`.
4. Restore object storage data.
5. Restart the application.
