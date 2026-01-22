---
title: "Core Commands"
description: "Repository, PR, issue, CI, and release workflows from the CLI."
---

This page summarizes the most common non‑stack workflows.

## Repository

```bash
och repo create my-repo --private --description "My repo"
och repo clone owner/my-repo
och repo list
```

Shorthand:

```bash
och init --url http://localhost:3000
och push --branch main
```

## Pull requests

```bash
och pr create --base main --title "Fix auth" --body "Adds token checks"
och pr list --state open
och pr view 42
och pr merge 42 --squash
och pr checkout 42
och pr diff 42
och pr ready 42
```

## Issues

```bash
och issue create --title "Crash on login" --body "Steps to reproduce..."
och issue list --state open
och issue view 12
och issue comment 12 --body "I can reproduce"
och issue close 12 --comment "Fixed in #34"
och issue reopen 12
```

## Branches

```bash
och branch list
och branch create feature/notes --checkout
och branch rename feature/notes feature/release-notes
och branch delete feature/notes --remote
```

## CI/CD

```bash
och ci list --branch main
och ci view 101 --jobs
och ci trace 809 --follow
```

## Releases

```bash
och release create v1.2.0 --title "1.2.0" --generate-notes
och release list
och release view v1.2.0
och release delete v1.2.0
```

## Search

```bash
och search repos "opencode"
och search issues "crash" --state open
och search prs "refactor" --state open
```

## Secrets

```bash
# repo secret
printf "s3cr3t" | och secret set API_TOKEN

# environment secret
printf "s3cr3t" | och secret set API_TOKEN --env production

# org secret
printf "s3cr3t" | och secret set API_TOKEN --org my-org

och secret list
och secret delete API_TOKEN --yes
```

## SSH keys

```bash
och ssh-key add --file ~/.ssh/id_ed25519.pub
och ssh-key list
och ssh-key delete <key-id>
```

## Direct API calls

```bash
och api /user
och api /repos/owner/name -X PATCH -F "description=New description"
```

> All commands support `--help` for full options.
