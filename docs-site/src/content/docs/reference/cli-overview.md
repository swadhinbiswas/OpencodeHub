---
title: "CLI Overview"
description: "How the OpenCodeHub CLI is structured and where to start."
---

The OpenCodeHub CLI (`och`) is a structured, command‑group based tool. Most workflows start with authentication and repository initialization, then move into PR, stack, and CI operations.

## Installation

```bash
npm install -g opencodehub-cli
```

## Global flags

- `--help`, `-h`: Show help
- `--version`, `-v`: Print version
- `--debug`: Verbose diagnostics

## Command matrix

| Group      | Purpose                       | Subcommands (common)                                                    |
| ---------- | ----------------------------- | ----------------------------------------------------------------------- |
| `auth`     | Authenticate with an instance | `login`, `logout`, `status`                                             |
| `config`   | CLI configuration             | `list`, `get`, `set`, `unset`, `path`, `reset`                          |
| `repo`     | Repository actions            | `create`, `clone`, `list`, `push`                                       |
| `pr`       | Pull requests                 | `create`, `list`, `view`, `merge`, `checkout`, `close`, `diff`, `ready` |
| `issue`    | Issues                        | `create`, `list`, `view`, `close`, `reopen`, `comment`                  |
| `stack`    | Stacked PR workflow           | `create`, `submit`, `view`, `sync`, `status`, `rebase`                  |
| `queue`    | Merge queue                   | `add`, `list`, `status`, `remove`                                       |
| `review`   | Reviews & AI review           | `ai`, `status`, `approve`, `request-changes`, `comment`                 |
| `ci`       | CI/CD runs                    | `list`, `view`, `trace`                                                 |
| `metrics`  | Metrics summary               | `show`                                                                  |
| `insights` | Metrics + leaderboard         | `show`, `team`, `repo`                                                  |
| `inbox`    | PR inbox                      | `list`, `section`                                                       |
| `notify`   | Notifications                 | `list`, `read`, `settings`                                              |
| `automate` | Automation rules              | `list`, `create`, `enable`, `disable`, `delete`                         |
| `branch`   | Git branch management         | `list`, `create`, `checkout`, `rename`, `delete`, `track`               |
| `release`  | Releases                      | `create`, `list`, `view`, `delete`                                      |
| `search`   | Search across entities        | `repos`, `issues`, `prs`                                                |
| `secret`   | Workflow secrets              | `list`, `set`, `delete`                                                 |
| `ssh-key`  | SSH keys                      | `list`, `add`, `delete`                                                 |
| `api`      | Raw API calls                 | Single command with `--method`                                          |
| Shorthand  | Convenience commands          | `init`, `sync`, `status`, `whoami`, `push`, `completion`                |

> Some subcommands are interactive by design. Use `--help` on any group for the authoritative list.

## Where configuration lives

Run `och config path` to see the exact config file location for your OS.

## Next steps

- See [reference/cli-auth-config](../reference/cli-auth-config) for login and config details.
- See [reference/cli-core-commands](../reference/cli-core-commands) for repo, PR, and issue workflows.
- See [reference/cli-stack-workflows](../reference/cli-stack-workflows) for the stacked PR flow.
