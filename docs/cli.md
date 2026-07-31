# OpenCodeHub CLI (och)

The OpenCodeHub CLI (`och`) provides a GitHub CLI-like experience for interacting with OpenCodeHub from the command line.

## Installation

```bash
npm install -g opencodehub-cli
```

## Quick Start

```bash
# 1. Login to your server
och auth login --url http://your-server:3000

# 2. Create a repository
och repo create my-project --description "My new project"

# 3. Push your code
och repo push --branch main
```

---

## Authentication

### `och auth login`
Login to OpenCodeHub.

```bash
och auth login --url http://your-server:3000
```

**Options:**
| Option | Description |
|--------|-------------|
| `-u, --url <url>` | OpenCodeHub server URL |
| `-t, --token <token>` | Personal access token (non-interactive) |
| `--with-token` | Authenticate using interactive token entry |
| `--ca-file <path>` | Path to custom CA bundle (self-signed TLS) |
| `--insecure` | Disable TLS certificate verification |

**Examples:**
```bash
# Interactive login
och auth login --url http://localhost:3000

# Non-interactive with token
och auth login --url http://localhost:3000 -t och_xxxxx

# Self-signed TLS
och auth login --url https://git.example.com --ca-file /path/to/ca.pem
```

### `och auth logout`
Logout from OpenCodeHub.

```bash
och auth logout
```

### `och auth status`
Show current authentication status.

```bash
och auth status
```

---

## Repository Management

### `och repo create <name>`
Create a new repository on OpenCodeHub.

```bash
och repo create my-project --description "A cool project"
```

**Options:**
| Option | Description |
|--------|-------------|
| `-d, --description <desc>` | Repository description |
| `-p, --private` | Make repository private |
| `--no-init` | Don't initialize with README |

### `och repo clone <repo>`
Clone a repository from OpenCodeHub.

```bash
och repo clone owner/repo
och repo clone owner/repo my-local-name
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<repo>` | Repository in `owner/name` format |
| `[destination]` | Local directory name (optional) |

### `och repo push`
Push local repository to OpenCodeHub.

```bash
och repo push
och repo push --branch main
och repo push --force
```

**Options:**
| Option | Description |
|--------|-------------|
| `-b, --branch <branch>` | Branch to push |
| `-f, --force` | Force push (overwrite remote) |

### `och repo list`
List your repositories.

```bash
och repo list
```

---

## Git Operations

### `och git init`
Initialize a repository for OpenCodeHub.

```bash
och git init
och git init --url http://your-server:3000
```

**Options:**
| Option | Description |
|--------|-------------|
| `-u, --url <url>` | OpenCodeHub server URL |

### `och git push`
Push to OpenCodeHub (shorthand for `repo push`).

```bash
och git push
och git push --branch main --force
```

### `och git sync`
Sync with remote (fetch + push).

```bash
och git sync
och git sync --force
```

**Options:**
| Option | Description |
|--------|-------------|
| `-f, --force` | Force push after sync |

---

## Pull Requests

### `och pr create`
Create a new pull request.

```bash
och pr create
och pr create --title "feat: new feature" --base main
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --title <title>` | PR title |
| `-b, --base <branch>` | Base branch |
| `-h, --head <branch>` | Head branch |
| `-d, --description <desc>` | PR description |

### `och pr list`
List pull requests.

```bash
och pr list
och pr list --state open
```

**Options:**
| Option | Description |
|--------|-------------|
| `-s, --state <state>` | Filter by state (open, closed, all) |

### `och pr view <number>`
View a pull request.

```bash
och pr view 42
```

### `och pr checkout <number>`
Checkout a pull request locally.

```bash
och pr checkout 42
```

### `och pr merge <number>`
Merge a pull request.

```bash
och pr merge 42
```

### `och pr close <number>`
Close a pull request.

```bash
och pr close 42
```

---

## Stacked PRs

### `och stack create <name>`
Create a new branch in the current stack.

```bash
och stack create feature/child-1
```

### `och stack submit`
Push stack and create/update PRs for all branches.

```bash
och stack submit
```

### `och stack sync`
Rebase stack on updated main.

```bash
och stack sync
```

### `och stack log`
Visualize stack tree.

```bash
och stack log
```

### `och stack status`
Show current stack and branch status.

```bash
och stack status
```

---

## Issues

### `och issue create`
Create a new issue.

```bash
och issue create --title "Bug: something broken" --body "Description..."
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --title <title>` | Issue title |
| `-b, --body <body>` | Issue body |
| `--labels <labels>` | Comma-separated labels |

### `och issue list`
List issues.

```bash
och issue list
och issue list --state open
```

**Options:**
| Option | Description |
|--------|-------------|
| `-s, --state <state>` | Filter by state (open, closed, all) |

### `och issue view <number>`
View an issue.

```bash
och issue view 42
```

### `och issue close <number>`
Close an issue.

```bash
och issue close 42
```

---

## Branches

### `och branch checkout [branch]`
Checkout a branch (interactive if no branch specified).

```bash
och branch checkout
och branch checkout main
```

### `och branch rename [old-name] <new-name>`
Rename a branch.

```bash
och branch rename old-name new-name
```

---

## Merge Queue

### `och queue add <pr-number>`
Add a pull request to the merge queue.

```bash
och queue add 42
```

### `och queue list`
List merge queue items.

```bash
och queue list
```

### `och queue remove <pr-number>`
Remove a pull request from the merge queue.

```bash
och queue remove 42
```

---

## CI/CD

### `och ci list`
List pipeline runs.

```bash
och ci list
```

### `och ci view <run-id>`
View a pipeline run.

```bash
och ci view run-123
```

### `och ci cancel <run-id>`
Cancel a pipeline run.

```bash
och ci cancel run-123
```

---

## Releases

### `och release create <tag>`
Create a new release.

```bash
och release create v1.0.0 --name "Version 1.0.0" --body "Release notes..."
```

**Options:**
| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Release name |
| `-b, --body <body>` | Release notes |
| `--draft` | Create as draft |
| `--prerelease` | Mark as pre-release |

### `och release list`
List releases.

```bash
och release list
```

---

## Code Review

### `och review ai <pr-number>`
Trigger AI code review for a pull request.

```bash
och review ai 42
```

### `och review status <pr-number>`
Check AI review status.

```bash
och review status 42
```

---

## Secrets

### `och secret set <name>`
Set a secret.

```bash
och secret set MY_SECRET
```

### `och secret list`
List secrets.

```bash
och secret list
```

### `och secret delete <name>`
Delete a secret.

```bash
och secret delete MY_SECRET
```

---

## Notifications

### `och notify list`
List your notifications.

```bash
och notify list
```

### `och notify read [id]`
Mark notification(s) as read.

```bash
och notify read
och notify read notification-id
```

---

## SSH Keys

### `och ssh-key add`
Add an SSH key to your account.

```bash
och ssh-key add
```

### `och ssh-key list`
List your SSH keys.

```bash
och ssh-key list
```

### `och ssh-key delete <id>`
Delete an SSH key.

```bash
och ssh-key delete key-id
```

---

## Search

### `och search repos <query>`
Search repositories.

```bash
och search repos "machine learning"
```

### `och search issues <query>`
Search issues.

```bash
och search issues "bug fix"
```

---

## Insights

### `och insights show`
Show your developer metrics.

```bash
och insights show
```

### `och insights team`
Show team/repository metrics.

```bash
och insights team
```

---

## Configuration

### `och config list`
List all configuration values.

```bash
och config list
```

### `och config get <key>`
Get a configuration value.

```bash
och config get serverUrl
```

### `och config set <key> <value>`
Set a configuration value.

```bash
och config set serverUrl http://localhost:3000
```

---

## Automations

### `och automate list`
List automation rules for current repository.

```bash
och automate list
```

### `och automate create`
Create a new automation rule.

```bash
och automate create
```

---

## Runner

### `och runner config`
Configure a self-hosted runner interactively.

```bash
och runner config
```

---

## API

### `och api <endpoint>`
Make direct API requests.

```bash
och api /api/user
och api /api/repos --method POST --data '{"name": "my-repo"}'
```

**Options:**
| Option | Description |
|--------|-------------|
| `-m, --method <method>` | HTTP method (GET, POST, PUT, DELETE) |
| `-d, --data <data>` | Request body (JSON) |

---

## Focus Mode

### `och focus`
Interactive stack and review cockpit.

```bash
och focus
```

A terminal UI for managing PRs, reviews, and merge queue.

---

## Shell Completions

### `och completion`
Generate shell completions.

```bash
# Bash
och completion > ~/.bashrc.d/och-completion.bash

# Zsh
och completion > ~/.zsh/completions/_och

# Fish
och completion --fish > ~/.config/fish/completions/och.fish
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OCH_TOKEN` | Personal access token (overrides config) |
| `OCH_SERVER_URL` | Server URL (overrides config) |
| `OCH_HTTP_TIMEOUT_MS` | HTTP request timeout (default: 15000) |

---

## Configuration File

The CLI stores configuration in `~/.config/opencodehub-cli/config.json`:

```json
{
  "serverUrl": "http://localhost:3000",
  "token": "och_xxxxx",
  "username": "your-username"
}
```

---

## Common Workflows

### New Repository
```bash
och auth login --url http://your-server:3000
mkdir my-project && cd my-project
git init
och repo create my-project --description "My project"
# Add files and commit
och repo push --branch main
```

### Daily Development
```bash
och git sync                    # Pull latest changes
och branch checkout feature-x   # Switch branch
# Make changes and commit
och git push                    # Push changes
och pr create --title "feat: X" # Create PR
```

### Stacked PRs
```bash
och stack create feature/part-1  # Create first branch
# Work on part 1
och stack submit                  # Push & create PR

och stack create feature/part-2  # Create child branch
# Work on part 2
och stack submit                  # Push & create PR

och stack log                     # View stack hierarchy
```

### Code Review
```bash
och pr list                      # See open PRs
och pr checkout 42               # Checkout PR branch
# Review code
och pr merge 42                  # Merge when ready
```
