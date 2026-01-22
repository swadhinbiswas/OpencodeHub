---
title: "Disaster Recovery"
description: "Back up and restore OpenCodeHub data safely."
---

This guide outlines a conservative recovery strategy that works across storage backends.

## 1) Back up the database

Use your database’s native backup tooling to snapshot the OpenCodeHub database. Examples:

- PostgreSQL: `pg_dump`
- MySQL: `mysqldump`

## 2) Back up Git data and storage

Back up the directories used by your instance:

- `GIT_REPOS_PATH` (default `./data/repositories`)
- `STORAGE_PATH` (default `./data/storage`)

If you use S3/R2/MinIO, snapshot the bucket or enable versioning.

## 3) Restore

1. Restore the database backup.
2. Restore repository and storage data to the configured paths.
3. Run migrations to match the code version:

```bash
npm run db:migrate
```

## 4) Validate

- Open the UI and check a repository.
- Confirm that PRs, issues, and CI history load.
- Perform a test clone to verify Git data integrity.

## 5) Automate

Use a scheduled backup job and store snapshots off‑site.
