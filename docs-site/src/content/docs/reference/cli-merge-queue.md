---
title: "Merge Queue"
description: "Manage the merge queue from the CLI."
---

The merge queue ensures PRs are merged in a stable, CI‑validated order. The CLI targets the current repository based on your `origin` remote.

## Add a PR

```bash
och queue add 128 --priority 5 --method squash
```

Options:

- `--priority <n>`: Higher number moves the PR up the queue.
- `--method <merge|squash|rebase>`: Merge strategy.

## List the queue

```bash
och queue list
```

Queue item statuses:

- `pending`: queued
- `running_ci`: CI is running
- `ready`: ready to merge
- `merging`: merge in progress
- `failed`: CI failed or merge blocked

## Check current PR status

```bash
och queue status
```

Automatically detects the PR for the current branch and reports its queue position.

## Remove from the queue

```bash
och queue remove 128
```
