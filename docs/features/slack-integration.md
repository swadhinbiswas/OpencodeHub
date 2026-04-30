# Slack Integration

> Get actionable notifications and review code without leaving Slack

OpenCodeHub's Slack integration sends real-time notifications for repository events and allows quick actions directly from Slack channels.

---

## Overview

### Supported Events

| Event | Notification | Actions |
|-------|-----------|---------|
| Pull Request opened | Title, author, branch, link | Review, Approve, Comment |
| PR approved / changes requested | Reviewer, status | View diff |
| PR merged | Merger, commit count | View commit |
| CI failed | Job name, failure step | View logs, Retry |
| Issue created / assigned | Title, assignee | View, Comment |
| Release published | Version, changelog | View release |
| Merge queue status | Position, ETA | Pause queue |
| Security alert | Severity, description | View alert |

---

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it "OpenCodeHub" and select your workspace

### 2. Configure Permissions

Add the following **Bot Token Scopes** under **OAuth & Permissions**:

```
chat:write
chat:write.public
im:write
users:read
files:write
```

### 3. Install App to Workspace

1. Click **Install to Workspace**
2. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 4. Configure OpenCodeHub

Add to your `.env`:

```bash
SLACK_ENABLED=true
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_SIGNING_SECRET=your-signing-secret
```

Or configure via the web UI:
1. Go to **Organization Settings** → **Integrations** → **Slack**
2. Paste the bot token and signing secret
3. Click **Test Connection**
4. Select default notification channel

### 5. Subscribe Repositories

Per-repository Slack settings:
1. Go to **Repository** → **Settings** → **Integrations**
2. Enable Slack notifications
3. Choose channel (or use default)
4. Select which events to notify

---

## Notification Format

### Pull Request Opened

```
🔀 New Pull Request in `my-repo`
*Add user authentication* by @alice
Branch: `feature/auth` → `main`
<Review PR | Approve | Request Changes>
```

### CI Failed

```
❌ CI Failed in `my-repo` — PR #42
*test* job failed at step "Run unit tests"
<View Logs | Retry Job>
```

### PR Approved

```
✅ PR #42 approved by @bob
*Add user authentication*
Ready to merge!
<Merge | View PR>
```

---

## Slash Commands

After installing the Slack app, use these commands in any channel:

```
/och prs [repo]           List open PRs
/och review <pr-number>   Quick review a PR
/och queue [repo]         Show merge queue status
/och issues [repo]        List open issues
```

---

## Threaded Discussions

PR notifications create threaded discussions in Slack:

1. PR opened → Notification posted
2. Team discusses in thread
3. Comments sync back to OpenCodeHub
4. Review decisions posted in thread

This keeps PR context in one place without cluttering the main channel.

---

## Channel Mapping

Route different events to different channels:

| Channel | Events |
|---------|--------|
| `#dev-pull-requests` | PR opened, approved, merged |
| `#dev-ci` | CI failures, pipeline status |
| `#dev-alerts` | Security alerts, merge queue issues |
| `#releases` | New releases, deployments |

Configure per repository in **Repository Settings** → **Integrations** → **Slack**.

---

## Troubleshooting

### "Notifications not appearing"

1. Verify the bot is invited to the channel (`/invite @OpenCodeHub`)
2. Check repository subscription settings
3. Verify `SLACK_BOT_TOKEN` is correct
4. Check OpenCodeHub logs for Slack API errors

### "Test connection fails"

- Ensure the bot token starts with `xoxb-`
- Verify the app is installed to the correct workspace
- Check that `chat:write` scope is granted

### "Too many notifications"

- Enable notification batching (group events within 5 minutes)
- Filter by event type in repository settings
- Use `@mentions` only mode for noisy repos

---

## See Also

- [Webhooks](../guides/webhooks.md)
- [CI/CD Pipelines](ci-cd.md)
- [Merge Queue](merge-queue.md)
