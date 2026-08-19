---
title: "Federation & Cross-Instance PRs"
---

> Connect two self-hosted OpenCodeHub instances so contributors on one can fork, contribute, and open pull requests against repositories hosted on another.

Federation lets a user on instance **A** fork a repository hosted on instance **B**, push branches back to B, and open **cross-instance pull requests** whose head branch lives on A's fork. B pulls the head from A's fork URL, creates a normal PR (with `headRepositoryId` unset), and the usual review and merge pipeline applies.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Setting Up Federation](#setting-up-federation)
- [Forking a Repository from Another Instance](#forking-a-repository-from-another-instance)
- [Contributing Back](#contributing-back)
- [Cross-Instance Pull Requests](#cross-instance-pull-requests)
- [Permissions](#permissions)
- [SSRF Protection](#ssrf-protection)

## Overview

The two instances interoperate over HTTP. Instance A talks to B's REST API using a Personal Access Token belonging to the contributing user on B. All git traffic flows over the normal smart-HTTP protocol using basic auth with that PAT.

```
┌─────────────────┐   import (clone URL + PAT)   ┌─────────────────┐
│  Instance A     │ ───────────────────────────▶ │  Instance B     │
│  bob/fedbase    │                              │  alice/fedbase  │
│  (fork)         │ ◀─────────────────────────── │  (upstream)     │
│                 │   push-upstream (git push)   │                 │
│                 │ ───────────────────────────▶ │                 │
│                 │   federation/open-pull       │  external-pulls │
└─────────────────┘ ◀─────────────────────────── └─────────────────┘
```

## How It Works

1. **Import (fork)**: On instance A, import `https://B/alice/fedbase.git` and authenticate with a PAT for the user on B. A detects that the source is another OpenCodeHub instance (`GET /api/instance`) and records the relationship as `forkedFromUrl`.
2. **Contribute back**: A can push any branch on its fork back to B (`federation/push-upstream`). B's existing `git-receive-pack` authorizes the push via `canWriteRepo` — B controls who may contribute.
3. **Cross-instance PR**: A calls `federation/open-pull` on B. B validates the fork URL (SSRF check), fetches the head branch from A's fork into the B repo, computes diff stats, and creates a PR whose head lives on A's fork.
4. **Review & merge**: The PR is a normal PR on B. Reviews, approvals, CI, and the merge queue all apply. Merging fetches the head ref and merges it into the base branch.

## Setting Up Federation

Federation is enabled out of the box. Two environment variables control SSRF behavior:

| Variable | Purpose |
|----------|---------|
| `FEDERATION_ALLOW_LOCALHOST` | Set `true` to allow fetching from `localhost`/loopback URLs. **Only** for two-instance testing on a single host or a trusted private network. Never enable in production. |

The upstream instance does not need any special config beyond the normal collaboration settings: the A user simply needs read access (to see the repo) and write access (to push branches and open PRs).

## Forking a Repository from Another Instance

On instance A, use the normal **Import Repository** flow:

1. Paste the upstream clone URL, e.g. `http://instance-b.local/swadhinbiswas/fedbase.git`.
2. Enter the **auth username** and a **PAT** for the user on instance B (the username must match the B account, e.g. `bob`).
3. Complete the import. Instance A records `forkedFromUrl` and stores an encrypted mirror PAT so it can push back later.

> For cross-instance PRs the source URL must be fetchable by B — the fork must be on a host B can reach, and the fork repo must be readable by B (public, or accessible with the embedded PAT).

## Contributing Back

From the fork's repository page on A, the **Federation** panel offers **Push branch to upstream**:

- Pick a branch on the fork.
- A pushes `branch:branch` to the upstream clone URL, authenticating with the stored B user's PAT.

B's permission model decides whether the push succeeds — the B user must be a collaborator (or the repo must allow external writes).

## Cross-Instance Pull Requests

From the same **Federation** panel, **Open cross-instance PR**:

1. A calls `POST /api/repos/{owner}/{repo}/external-pulls` on B (server-to-server) with the fork URL, head branch, base branch, title, and body.
2. B validates the fork URL, fetches the head into the B repo, computes additions/deletions/changed files, and creates the PR.
3. The PR's head branch resolves to the fetched ref on B, so the diff, comments, and merge all work normally.

### Endpoints

| Endpoint (on B) | Purpose |
|-----------------|---------|
| `POST /api/repos/{owner}/{repo}/external-pulls` | Create a PR whose head is fetched from an external fork URL |
| `GET /api/instance` | Instance metadata probe used for detection |

## Permissions

- **Import on A**: requires a valid PAT for the B user.
- **Push upstream**: B's `git-receive-pack` requires the B user to have write access to the repo.
- **Open a cross-instance PR**: B's `external-pulls` endpoint requires the caller to have read access plus either write access to the repo, or the repo must have **Allow external pull requests** enabled (repo → Settings → Federation).
- **Merge**: normal PR merge gates apply (approvals, required checks, branch protection).

## SSRF Protection

Every server-initiated fetch (import on A, external-pulls on B) runs through `validateGitCloneUrl`, which blocks private ranges, cloud metadata endpoints, and non-HTTP(S)/git/ssh schemes. The localhost bypass is only available when `FEDERATION_ALLOW_LOCALHOST=true`, and callers gate it explicitly.

Tokens embedded into fetch/push URLs are used transiently and never persisted.