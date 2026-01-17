<p align="center">
  <img src="https://raw.githubusercontent.com/swadhinbiswas/OpenCodeHub/main/public/logo.svg" alt="OpenCodeHub CLI" width="120" />
</p>

<h1 align="center">OpenCodeHub CLI</h1>

<p align="center">
  <strong>Stack-first PR workflows from your terminal</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/v/opencodehub-cli.svg?style=flat-square" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/dm/opencodehub-cli.svg?style=flat-square" alt="npm downloads" /></a>
  <a href="https://github.com/swadhinbiswas/OpencodeHub/blob/main/cli/LICENSE"><img src="https://img.shields.io/npm/l/opencodehub-cli.svg?style=flat-square" alt="license" /></a>
  <a href="https://github.com/swadhinbiswas/OpencodeHub"><img src="https://img.shields.io/github/stars/swadhinbiswas/OpenCodeHub?style=flat-square" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="#-installation">Installation</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-commands">Commands</a> •
  <a href="#-workflow-examples">Examples</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

## ✨ Features

- 📚 **Stacked PRs** - Create dependent pull requests that automatically update when parent changes
- 🔄 **Smart Sync** - Rebase entire stacks with a single command
- 🚀 **Fast Workflow** - Submit, update, and manage PRs without leaving your terminal
- 🔗 **GitHub/GitLab Alternative** - Works with self-hosted OpenCodeHub instances
- 🎯 **Zero Config** - Works out of the box with sensible defaults

## 📦 Installation

```bash
# Install globally with npm
npm install -g opencodehub-cli

# Or with yarn
yarn global add opencodehub-cli

# Or with pnpm
pnpm add -g opencodehub-cli

# Verify installation
och --version
```

## 🚀 Quick Start

```bash
# 1. Login to your OpenCodeHub instance
och auth login

# 2. Navigate to your repository
cd your-repo

# 3. Initialize (one-time setup)
och init --url https://git.yourcompany.com

# 4. Create your first stack
och stack create my-feature

# 5. Make changes, commit, and submit
git add . && git commit -m "Add feature"
och stack submit
```

## 📖 Commands

### Authentication

| Command | Description |
|---------|-------------|
| `och auth login` | Interactive login |
| `och auth login --token TOKEN` | Login with access token (for CI/CD) |
| `och auth whoami` | Show current user |
| `och auth logout` | Clear stored credentials |

### Stack Management

| Command | Description |
|---------|-------------|
| `och stack create <name>` | Create a new branch in current stack |
| `och stack view` / `och stack ls` | View all branches in current stack |
| `och stack submit` | Push and create/update PR |
| `och stack submit --draft` | Submit as draft PR |
| `och stack sync` | Rebase entire stack on latest main |
| `och stack reorder` | Interactively reorder branches |

### Repository Operations

| Command | Description |
|---------|-------------|
| `och init` | Initialize repo for OpenCodeHub |
| `och status` / `och st` | Show current stack status |
| `och sync` | Sync with remote |

## 🔄 Workflow Examples

### Creating a Feature Stack

```bash
# Start from main
git checkout main && git pull

# Create base layer
och stack create database-schema
# ... make changes ...
git commit -m "Add user database models"

# Create next layer (builds on database-schema)
och stack create auth-service
# ... make changes ...
git commit -m "Add authentication service"

# Submit entire stack
och stack submit

# Result:
# PR #1: Add user database models (main ← database-schema)
# PR #2: Add auth service (database-schema ← auth-service)
```

### Updating After Review

```bash
# Make requested changes
git add . && git commit -m "Address review feedback"

# Resubmit (updates PR automatically)
och stack submit

# If main changed, sync the whole stack
och stack sync
```

## ⚙️ Configuration

OCH CLI stores configuration in `~/.ochrc`.

```bash
# View config
och config list

# Set config
och config set host https://git.yourcompany.com
och config set defaultBranch main
```

## 🔧 CI/CD Usage

```yaml
# .github/workflows/pr.yml
name: Submit PR
on: push

jobs:
  submit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install CLI
        run: npm install -g opencodehub-cli
      
      - name: Login & Submit
        run: |
          och auth login --token ${{ secrets.OCH_TOKEN }}
          och stack submit
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](https://github.com/swadhinbiswas/OpencodeHub/blob/main/CONTRIBUTING.md).

```bash
# Clone the repo
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub/cli

# Install dependencies
npm install

# Run in development mode
npm run dev
```

## 📝 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🔗 Links

- [OpenCodeHub](https://github.com/swadhinbiswas/OpencodeHub) - The main project
- [Documentation](https://github.com/swadhinbiswas/OpencodeHub#readme)
- [Report Issues](https://github.com/swadhinbiswas/OpencodeHub/issues)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/swadhinbiswas">Swadhin Biswas</a>
</p>
