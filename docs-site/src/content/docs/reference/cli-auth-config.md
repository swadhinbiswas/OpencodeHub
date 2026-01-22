---
title: "Auth & Config"
description: "Login flow, token handling, and CLI configuration."
---

This page covers how authentication and local configuration work in the OpenCodeHub CLI.

## Authentication

### Login

```bash
och auth login --url http://localhost:3000
```

Options:

- `--url <url>`: Instance URL (defaults to `http://localhost:3000`)
- `--with-token`: Prompt for a personal access token
- `--token <token>`: Non‑interactive token login

Tokens are validated via `GET /api/user` and are expected to start with the `och_` prefix.

### Status

```bash
och auth status
```

Shows the authenticated user, server, and token preview.

### Logout

```bash
och auth logout
```

Clears the stored token from your local config.

## Configuration

The CLI persists settings locally. View the location at any time:

```bash
och config path
```

### Common keys

- `serverUrl`: OpenCodeHub server URL
- `token`: Personal access token
- `defaultBranch`: Default base branch for PRs (default: `main`)
- `editor`: Editor for interactive input
- `pager`: Pager for long output

### List & edit

```bash
och config list
och config get serverUrl
och config set serverUrl https://git.example.com
och config unset editor
```

## Identity shortcut

```bash
och whoami
```

A convenience command that validates your token and prints the username.

## Shell completions

```bash
och completion bash
```

Supported shells: `bash`, `zsh`, `fish`.
