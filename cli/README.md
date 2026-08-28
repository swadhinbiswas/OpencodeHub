<h1 align="center">OpenCodeHub CLI (och)</h1>

<p align="center">
  <strong>Stack-first PR workflows, speculative merge queues, and terminal cockpit for OpenCodeHub.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/v/opencodehub-cli.svg?style=flat-square" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/dm/opencodehub-cli.svg?style=flat-square" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="license" /></a>
</p>

---

## 📦 Installation

Install `opencodehub-cli` globally with your favorite package manager:

```bash
# npm
npm install -g opencodehub-cli

# bun
bun add -g opencodehub-cli

# pnpm
pnpm add -g opencodehub-cli

# yarn
yarn global add opencodehub-cli
```

Or execute commands on-demand without installing:

```bash
npx opencodehub-cli focus
```

Verify your installation:

```bash
och --version
och --help
```

---

## ⚡ Quick Start

### 1. Authenticate with your OpenCodeHub Instance

```bash
# Interactive login prompt
och auth login --url https://git.yourcompany.com

# Non-interactive / CI login
och auth login --url https://git.yourcompany.com --token och_xxxxxxxxxxxxxxxx
```

Check configuration and credential storage health:

```bash
och config doctor
```

### 2. Stacked PR Workflow

OpenCodeHub supports Graphite-style stacked branches from your terminal:

```bash
# 1. Create your first stack branch
och stack create feature/part-1

# Make edits and commit
git commit -am "feat: part 1 implementation"

# 2. Create the next dependent branch on top of part-1
och stack create feature/part-2

git commit -am "feat: part 2 implementation"

# 3. Submit all branches in the stack (pushes refs & creates linked PRs)
och stack submit

# 4. Visualize the stack hierarchy
och stack log

# 5. Rebase stack when target base branch changes
och stack sync
```

---

## 🕹 Interactive Focus Cockpit (`och focus`)

The `och focus` command opens an interactive terminal dashboard for fast daily development:

```bash
och focus
```

- **Stack Cockpit**: Navigate branches, view parent/child dependencies, and submit changes.
- **Review Inbox**: Inspect assigned reviews, view diff snippets, and submit approvals or change requests.
- **Merge Queue Status**: Track speculative build progress and priority lanes in real time.
- **AI Reviews**: Trigger AI review analysis directly from the terminal.

---

## 📋 Command Reference

| Command | Description | Example |
|---|---|---|
| `och auth` | Manage authentication credentials | `och auth login --url http://localhost:4321` |
| `och stack` | Stacked PR creation, sync, log, submit | `och stack submit` |
| `och focus` | Interactive terminal review & stack cockpit | `och focus` |
| `och pr` | Pull request lifecycle management | `och pr create --base main --title "feat: demo"` |
| `och queue` | Merge queue control & speculative runs | `och queue list`, `och queue add 42` |
| `och review` | Code review and AI review trigger | `och review start 42` |
| `och repo` | Repository operations (clone, push, create) | `och repo create my-app` |
| `och issue` | Issue tracking & milestone management | `och issue list`, `och issue create` |
| `och ci` | CI pipeline logs and execution control | `och ci list`, `och ci view 12` |
| `och config` | CLI configuration & doctor check | `och config doctor` |
| `och whoami` | Display active user profile & server URL | `och whoami` |
| `och api` | Make direct authenticated REST API calls | `och api GET /api/user` |

Run `och <command> --help` for specific flags and subcommands.

---

## 🔒 Security & Token Storage

The CLI automatically stores credentials in your operating system's secure credential manager:

- **macOS**: Apple Keychain (`security`)
- **Linux**: Secret Service API / libsecret (`secret-tool`)
- **Windows**: Windows Credential Manager / DPAPI
- **CI / Headless**: Set the `OCH_TOKEN` and `OCH_URL` environment variables.

---

## 📄 License

MIT © OpenCodeHub Contributors
