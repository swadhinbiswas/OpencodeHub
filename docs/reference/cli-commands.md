# CLI Command Reference

The `opencodehub-cli` (or `och`) is the official command-line tool for interacting with OpenCodeHub.

## Installation

```bash
npm install -g opencodehub-cli
```

## Global Flags

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help for command |
| `--version`, `-v` | Show CLI version |
| `--debug` | Enable verbose debug output |
| `--url <url>` | Override the configured instance URL |

---

## 🔐 Auth

Manage authentication state.

### `och auth login`

Authenticates with an OpenCodeHub instance.

```bash
# Interactive mode
och auth login

# With flags
och auth login --url https://git.yourcompany.com --token <pat>
```

### `och auth status`

Check current login status and user.

```bash
och auth status
```

### `och auth logout`

Clear stored credentials.

```bash
och auth logout
```

### `och auth whoami`

Show current user information.

```bash
och auth whoami
```

---

## 📦 Repo

Manage repositories.

### `och repo list`

List repositories you have access to.

```bash
och repo list
och repo list --org acme
```

### `och repo create <name>`

Create a new repository.

```bash
och repo create my-project --private
och repo create my-project --public --desc "My awesome project"
```

### `och repo clone <repo>`

Clone a repository.

```bash
och clone swadhin/my-project
```

### `och repo delete <repo>`

Delete a repository (requires confirmation).

```bash
och repo delete swadhin/my-project
```

---

## 📚 Stack

Manage Stacked Pull Requests.

### `och stack create <branch-name>`

Create a new branch stacked on top of the current one.

```bash
och stack create feature-b  # When on feature-a
```

### `och stack submit`

Submit all branches in the current stack as Pull Requests.

```bash
och stack submit
```

### `och stack sync`

Rebase the entire stack onto the updated base branch.

```bash
och stack sync
```

### `och stack log`

Show the current stack topology.

```bash
och stack log
```

### `och stack view`

Visualize the current stack in ASCII tree format.

```bash
och stack view
```

---

## 🔀 PR

Manage Pull Requests.

### `och pr list`

List open PRs for the current repo.

```bash
och pr list
och pr list --state merged
och pr list --author alice
```

### `och pr checkout <number>`

Checkout a PR by its number.

```bash
och pr checkout 42
```

### `och pr create`

Create a new pull request.

```bash
och pr create --title "Fix bug" --base main
```

### `och pr merge <number>`

Merge a pull request.

```bash
och pr merge 42 --squash
```

### `och pr status [number]`

Show CI status and review state of a PR.

```bash
och pr status 42
```

---

## 🐛 Issue

Manage issues.

### `och issue list`

List issues for the current repo.

```bash
och issue list
och issue list --state closed --label bug
```

### `och issue create`

Create a new issue.

```bash
och issue create --title "Bug report" --body "Something is broken"
```

### `och issue close <number>`

Close an issue.

```bash
och issue close 42
```

### `och issue comment <number>`

Add a comment to an issue.

```bash
och issue comment 42 --body "Looking into this"
```

---

## 🔀 Branch

Manage branches.

### `och branch list`

List branches for the current repo.

```bash
och branch list
och branch list --remote
```

### `och branch delete <name>`

Delete a branch.

```bash
och branch delete feature/old-branch
```

---

## 🔀 Queue

Manage the merge queue.

### `och queue list`

View the merge queue.

```bash
och queue list
```

### `och queue add <pr-number>`

Add a PR to the merge queue.

```bash
och queue add 42
och queue add 42 --priority high
```

### `och queue remove <pr-number>`

Remove a PR from the queue.

```bash
och queue remove 42
```

### `och queue status`

Show queue status and health.

```bash
och queue status
```

---

## 👁 Review

Code review shortcuts.

### `och review list`

List PRs awaiting your review.

```bash
och review list
```

### `och review approve <number>`

Approve a PR.

```bash
och review approve 42
```

### `och review request-changes <number>`

Request changes on a PR.

```bash
och review request-changes 42 --body "Please fix the error handling"
```

---

## 📊 Metrics

View developer metrics.

### `och metrics --me`

View your personal metrics.

```bash
och metrics --me
```

### `och metrics --team`

View team metrics.

```bash
och metrics --team
```

### `och metrics --repo <repo>`

View repository metrics.

```bash
och metrics --repo owner/repo
```

---

## ⚙️ CI

Manage CI/CD pipelines.

### `och ci list`

List recent workflow runs.

```bash
och ci list
och ci list --repo owner/repo
```

### `och ci logs <run-id>`

View logs for a workflow run.

```bash
och ci logs 12345
```

### `och ci cancel <run-id>`

Cancel a running workflow.

```bash
och ci cancel 12345
```

### `och ci rerun <run-id>`

Rerun a workflow.

```bash
och ci rerun 12345
```

---

## 🎯 Focus

Interactive focus cockpit (terminal UI).

### `och focus`

Launch the interactive terminal dashboard.

```bash
och focus
```

Shows:
- PRs requiring your attention
- Merge queue status
- Recent notifications
- Quick actions

---

## 📥 Inbox

Manage notifications.

### `och inbox`

View unread notifications.

```bash
och inbox
```

### `och inbox read`

Mark notifications as read.

```bash
och inbox read
```

---

## 🔍 Search

Search across repositories, issues, and PRs.

### `och search <query>`

Search globally.

```bash
och search "authentication bug"
och search "auth" --type issues
```

---

## 🔧 Config

Manage CLI configuration.

### `och config get <key>`

Get a configuration value.

```bash
och config get url
```

### `och config set <key> <value>`

Set a configuration value.

```bash
och config set url https://git.yourcompany.com
```

### `och config doctor`

Diagnose configuration issues.

```bash
och config doctor
```

---

## 🔑 SSH Key

Manage SSH keys.

### `och ssh-key list`

List your SSH keys.

```bash
och ssh-key list
```

### `och ssh-key add <path>`

Add an SSH key.

```bash
och ssh-key add ~/.ssh/id_ed25519.pub
```

### `och ssh-key delete <id>`

Delete an SSH key.

```bash
och ssh-key delete key_123
```

---

## 🔔 Notify

Configure notification preferences.

### `och notify status`

Show notification settings.

```bash
och notify status
```

---

## 🚀 Release

Manage releases.

### `och release list`

List releases for the current repo.

```bash
och release list
```

### `och release create <tag>`

Create a new release.

```bash
och release create v1.0.0 --title "Version 1.0.0" --notes "Release notes"
```

---

## 🤖 Automate

Manage automation rules.

### `och automate list`

List automation rules.

```bash
och automate list
```

---

## 🔐 Secret

Manage repository secrets.

### `och secret list`

List secrets for the current repo.

```bash
och secret list
```

### `och secret set <name>`

Set a secret value.

```bash
och secret set API_KEY
# Enter value when prompted
```

---

## 🔌 API

Make raw API requests.

### `och api <path>`

Make an authenticated API request.

```bash
och api /user
och api /repos/owner/repo/issues --method POST --body '{"title":"Bug"}'
```

---

## 📈 Insights

View repository insights.

### `och insights`

Show repository insights and analytics.

```bash
och insights
och insights --repo owner/repo
```

---

## 🏃 Runner

Manage CI runners.

### `och runner config`

Configure a self-hosted runner.

```bash
och runner config --url https://git.yourcompany.com --token <runner-token>
```

---

## Shell Completions

Generate shell completions for bash, zsh, or fish:

```bash
# Bash
och completion bash > /usr/local/etc/bash_completion.d/och

# Zsh
och completion zsh > /usr/local/share/zsh/site-functions/_och

# Fish
och completion fish > ~/.config/fish/completions/och.fish
```
