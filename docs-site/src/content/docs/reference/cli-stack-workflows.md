---
title: "Stack Workflows"
description: "Create, submit, and sync stacked PRs from the CLI."
---

Stacked PRs use branches prefixed with `stack/` and are designed for incremental review.

## Create a stack

```bash
# On your base branch
och stack create auth-schema

# Add changes and commit
# ...

# Create the next layer
och stack create auth-service
```

`och stack create` creates `stack/<name>` and keeps it tied to the current stack history.

## Submit a stack

```bash
och stack submit
```

- Pushes all `stack/*` branches.
- Creates or updates PRs through the OpenCodeHub API when available.
- Uses `main` as the default base branch.

Use `--draft` to create draft PRs, and `--message` to prefix PR titles.

## View stack

```bash
och stack view
```

Outputs a simple ASCII stack tree with the current branch highlighted.

## Sync stack

```bash
och stack sync
```

Syncs stack branches with the remote. Use:

- `--push` to only push
- `--pull` to only pull (rebase)
- `--force` for force-with-lease pushes

## Status

```bash
och stack status
```

Shows ahead/behind and sync status for each `stack/*` branch.

## Rebase stack

```bash
och stack rebase --base main
```

Rebases the current stack on the chosen base branch.

## Tips

- Keep each stack layer small and reviewable.
- Avoid mixing unrelated changes across layers.
- When a lower PR merges, rebase or sync the upper layers.
