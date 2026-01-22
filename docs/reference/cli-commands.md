---
title: "Legacy: CLI Command Reference"
slug: "legacy/reference/cli-commands"
---

# CLI Command Reference

The `opencodehub-cli` (or `och`) is your primary tool for interacting with OpenCodeHub from the terminal.

## Installation

```bash
npm install -g opencodehub-cli
```

## Global Flags

- `--help`, `-h`: Show help for command.
- `--version`, `-v`: Show CLI version.
- `--debug`: Enable verbose debug output.

---

## 🔐 Auth

Manage authentication state.

### `och auth login`

Authenticates with an OpenCodeHub instance.

- **Interactive Mode**: Prompts for URL and credentials.
- **Flags**:
  - `--url <url>`: OCH instance URL.
  - `--token <token>`: Bypass browser login with existing token.

### `och auth status`

Check current login status and user.

### `och auth logout`

Clear stored credentials.

---

## 📦 Repo

Manage repositories.

### `och clone <repo>`

Clone a repository.

- **Example**: `och clone swadhin/my-project`
- **Behavior**: Automatically sets up remote `origin`.

### `och create [name]`

Create a new repository.

- **Flags**:
  - `--public`: Make repository public.
  - `--private`: Make repository private.
  - `--desc <text>`: Description.

### `och push`

Push changes to the remote.

- **Features**: Shows a progress bar and PR link on success.

---

## 📚 Stack

Manage Stacked Pull Requests.

### `och stack create <branch-name>`

Create a new branch stacked on top of the current one.

- **Example**: `och stack create feature-b` (when on `feature-a`).

### `och stack submit`

Submit all branches in the current stack as Pull Requests.

- **Behavior**:
  - Pushes all branches.
  - Creates/Updates PRs.
  - Sets correct base branches (`feature-a` -> `main`, `feature-b` -> `feature-a`).

### `och stack sync`

Rebase the entire stack.

- **Use Case**: When `main` has updated or a lower PR changed.

### `och stack view`

Visualize the current stack in ASCII tree format.

---

## 🔀 Pr

Manage Pull Requests.

### `och pr list`

List open PRs for current repo.

### `och pr checkout <number>`

Checkout a PR by its number.

### `och pr status [number]`

Show CI status and review state of a PR.
