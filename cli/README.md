# OCH CLI - OpenCodeHub Command Line Interface

**Stack-first PR workflows from your terminal.**

## Installation

```bash
# Install globally
npm install -g opencodehub-cli

# Or use with npx (no installation needed)
npx opencodehub-cli

# Verify installation
och --version
```

## Quick Start

```bash
# 1. Login to your OpenCodeHub instance
och auth login

# Enter your email and password when prompted
# Or use a personal access token:
och auth login --token YOUR_TOKEN

# 2. Navigate to your repository
cd your-repo

# 3. Initialize (one-time setup)
och init --url https://git.yourcompany.com

# 4. You're ready! Try:
och status
```

## Commands

### Authentication

```bash
# Interactive login
och auth login

# Login with server URL
och auth login --url https://git.yourcompany.com

# Login with token (CI/CD)
och auth login --token YOUR_ACCESS_TOKEN

# Check who you're logged in as
och auth whoami

# Logout
och auth logout
```

### Stack Management

**Create Stacked Branches:**
```bash
# Create a new branch in current stack
och stack create \u003cbranch-name\u003e

# Example:
git checkout main
och stack create database-schema
# Make changes, commit
och stack create auth-service
# Make changes, commit
```

**View Stack:**
```bash
# See all branches in current stack
och stack view

# Short alias:
och stack ls

# Example output:
# 📚 Current Stack
#   ┌─ main (base)
#   ├─ stack/database-schema ✓ Pushed
#   └─ stack/auth-service  * Current
```

**Submit Stack:**
```bash
# Push current branch and create/update PR
och stack submit

# Create as draft PR
och stack submit --draft

# This will:
# - Push your branch to origin
# - Create  PR or update existing one
# - Link it to parent PR if in a stack
```

**Sync Stack:**
```bash
# Rebase entire stack on latest main
och stack sync

# This handles:
# - Fetching latest from origin
# - Rebasing each branch in order
# - Detecting and reporting conflicts
```

**Reorder Stack:**
```bash
# Interactively reorder branches
och stack reorder

# Choose new order from list
# Stack dependencies will be updated
```

### Repository Operations

```bash
# Initialize repo for OpenCodeHub
och init [--url \u003cserver-url\u003e]

# Show current stack status
och status
# Alias: och st

# Sync with remote (bi-directional)
och sync
```

## Workflow Examples

### Example 1: Create a Feature Stack

```bash
# Start from main
git checkout main
git pull

# Create base layer
och stack create user-models
# ... edit files ...
git add .
git commit -m "Add user database models"

# Create middleware layer (builds on user-models)
och stack create auth-middleware
# ... edit files ...
git add .
git commit -m "Add authentication middleware"

# Create UI layer (builds on auth-middleware)
och stack create login-page
# ... edit files ...
git add .
git commit -m "Add login page UI"

# Submit entire stack
och stack submit

# Result:
# PR #301: Add user database models (main ← user-models)
# PR #302: Add auth middleware (user-models ← auth-middleware)
# PR #303: Add login page (auth-middleware ← login-page)
```

### Example 2: Update Stack After Review

```bash
# You're on stack/login-page
# Reviewer requested changes

# Make changes
git add .
git commit -m "Address review feedback"

# Resubmit (updates PR automatically)
och stack submit

# If base changed, sync the whole stack
och stack sync
```

### Example 3: collaboration on Stacks

```bash
# Teammate created a stack, you want to build on it
git fetch
git checkout their-branch

# Create your branch on top
och stack create my-feature
# ... make changes ...
git commit -m "My changes"

# Submit (will link your PR to theirs)
och stack submit
```

## Configuration

OCH CLI stores configuration in `~/.ochrc` (JSON format).

**View config:**
```bash
och config list
```

**Set config:**
```bash
och config set host https://git.yourcompany.com
och config set token YOUR_TOKEN
```

**Config file structure:**
```json
{
  "host": "https://git.yourcompany.com",
  "token": "your-access-token",
  "defaultBranch": "main"
}
```

## Troubleshooting

### "Not logged in" Error

```bash
# Check auth status
och auth whoami

# If not logged in:
och auth login
```

### "No stack found" Error

```bash
# Ensure you're in a git repository
git status

# Initialize if needed
och init

# Check current branch
git branch
```

### Permission Denied

```bash
# Verify your token has correct permissions
och auth whoami

# Login again with fresh token
och auth logout
och auth login --token NEW_TOKEN
```

### Stack Sync Conflicts

```bash
# If sync encounters conflicts:
# 1. Resolve conflicts in each branch
# 2. Continue sync:
git rebase --continue

# 3. Or abort and do manual rebase:
git rebase --abort
git checkout main
git pull
git checkout your-branch
git rebase main
```

## CI/CD Usage

```yaml
# .github/workflows/deploy.yml
name: Deploy Stack
on:
  push:
    branches: ['stack/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3

      - name: Install OCH CLI
        run: npm install -g opencodehub-cli

      - name: Login
        run: och auth login --token ${{ secrets.OCH_TOKEN }}

      - name: Submit PR
        run: och stack submit
```

## Advanced Features

### Custom PR Templates

Create `.github/pull_request_template.md` in your repo:

```markdown
## Description
<!-- What does this PR do? -->

## Stack Position
<!-- Part of stack: #XXX → This PR → #YYY -->

## Checklist
- [ ] Tests pass
- [ ] Docs updated
```

### Hooks

OCH CLI supports git hooks for validation:

```bash
# .git/hooks/pre-push
#!/bin/bash
# Validate stack before push
och stack verify || exit 1
```

## API Integration

OCH CLI uses OpenCodeHub REST API. Token permissions needed:
- `repo` - Repository read/write
- `pr` - Pull request create/update
- `user` - Read user profile

Generate token: `https://your-server/settings/tokens`

## Contributing

OCH CLI is open source! Contribute at:
https://github.com/swadhinbiswas/OpencodeHub/tree/main/cli

## Support

- **Documentation**: https://git.yourcompany.com/docs
- **Issues**: https://github.com/swadhinbiswas/OpencodeHub/issues
- **Discussions**: https://github.com/swadhinbiswas/OpencodeHub/discussions

## changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

## License

MIT License - see [LICENSE](../LICENSE)
