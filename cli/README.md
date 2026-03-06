<p align="center">
  <img src="https://raw.githubusercontent.com/swadhinbiswas/OpencodeHub/main/cli/assets/opencodehub-cli-logo.svg" alt="OpenCodeHub CLI" width="860" />
</p>

<h1 align="center">OpenCodeHub CLI (OCH)</h1>

<p align="center">
  Production-ready Git workflows and stack-first pull request management from your terminal.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/v/opencodehub-cli.svg?style=flat-square" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/dm/opencodehub-cli.svg?style=flat-square" alt="npm downloads" /></a>
  <a href="https://github.com/swadhinbiswas/OpencodeHub/blob/main/cli/LICENSE"><img src="https://img.shields.io/npm/l/opencodehub-cli.svg?style=flat-square" alt="license" /></a>
</p>

## Why OCH

- Fast command-line workflows for repositories, pull requests, issues, and reviews.
- Stack-first branch/PR flow for multi-PR delivery.
- Secure authentication model with OS credential storage support.
- Built-in API tooling for scripting and automation.

## Installation

```bash
npm install -g opencodehub-cli
```

Verify:

```bash
och --version
och --help
```

## Quick Start

```bash
# 1) Authenticate
och auth login --url https://git.example.com

# 2) Inspect your setup
och config doctor

# 3) Push and open PR workflow
cd your-repo
och repo push

# 4) Create a pull request
och pr create --base main --title "feat: add onboarding"
```

## Core Commands

- `och auth` authentication (`login`, `logout`, `status`)
- `och config` CLI settings and diagnostics (`list`, `set`, `doctor`)
- `och repo` repository operations (`create`, `clone`, `push`, `list`)
- `och pr` pull request lifecycle (`create`, `list`, `view`, `merge`, ...)
- `och stack` stacked branch/PR workflows (`create`, `submit`, `sync`, ...)
- `och review` code review + AI review flows
- `och issue` issue management
- `och ci`, `och queue`, `och metrics`, `och insights`, `och notify`, `och automate`
- `och api` direct API requests (useful for scripts)

Run `och <command> --help` for full command options.

## Authentication and Security

### Login

```bash
och auth login --url https://git.example.com
```

For non-interactive environments:

```bash
och auth login --url https://git.example.com --token <PERSONAL_ACCESS_TOKEN>
```

### Token storage behavior

- `OCH_TOKEN` env var always takes precedence.
- macOS: Keychain (`security`)
- Linux: Secret Service (`secret-tool`)
- Windows: DPAPI-encrypted storage via PowerShell
- Fallback: local CLI config storage if secure backend is unavailable

### Helpful environment variables

- `OCH_TOKEN`: inject token from environment
- `OCH_HTTP_TIMEOUT_MS`: HTTP timeout in ms (default `15000`)
- `OCH_DISABLE_KEYCHAIN=1`: disable credential backend (useful in CI/tests)

## Configuration

Inspect current configuration:

```bash
och config list
och config path
och config doctor
```

Set values:

```bash
och config set serverUrl https://git.example.com
och config set defaultBranch main
och config set insecure false
```

## Common Workflows

### Repository lifecycle

```bash
# Create a remote repository
och repo create my-service --description "Internal API service"

# Clone repository
och repo clone acme/my-service

# Push local repository
och repo push --branch main
```

### Pull request lifecycle

```bash
# Create PR from current branch
och pr create --base main --title "feat: add API pagination"

# List open PRs
och pr list --state open

# View PR details
och pr view 42

# Merge PR
och pr merge 42
```

### Stack workflow

```bash
# Create first stack branch
och stack create auth-foundation

# Create subsequent branch
och stack create auth-ui

# Submit stack and create/update PRs
och stack submit
```

### AI review workflow

```bash
# Trigger AI review
och review ai 42

# Wait for completion
och review ai 42 --wait

# Check latest review status
och review status 42
```

### API mode for scripting

```bash
# Read current user
och api /user

# Create issue via API
och api /repos/acme/platform/issues -X POST -F title="Bug: timeout" -F body="Steps to reproduce"
```

## CI Usage Example

```yaml
name: OCH Automation
on: [push]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install -g opencodehub-cli
      - run: |
          export OCH_TOKEN="${{ secrets.OCH_TOKEN }}"
          och config set serverUrl https://git.example.com
          och config doctor
          och repo push --branch main
```

## Troubleshooting

### `Not logged in. Run 'och auth login' first.`

- Run `och auth login --url <server>`.
- Or export `OCH_TOKEN` for automation.

### `Server URL not configured`

- Run `och config set serverUrl https://git.example.com`.

### TLS / certificate issues

- Use `och config set caFile /path/to/ca.pem` for custom CA.
- Use `och config set insecure true` only for temporary debugging.

### Validate setup end-to-end

```bash
och config doctor
```

## Development

```bash
cd cli
npm install
npm run build
npm run test
```

## License

MIT
