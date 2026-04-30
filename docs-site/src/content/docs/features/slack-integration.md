---
title: "Slack Integration"
---

OpenCodeHub's Slack integration sends real-time notifications for repository events and allows quick actions directly from Slack channels.

## Supported Events

| Event | Notification | Actions |
|-------|-----------|---------|
| Pull Request opened | Title, author, branch | Review, Approve |
| PR approved / changes requested | Reviewer, status | View diff |
| PR merged | Merger, commit count | View commit |
| CI failed | Job name, failure step | View logs, Retry |
| Issue created / assigned | Title, assignee | View, Comment |
| Release published | Version, changelog | View release |

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it "OpenCodeHub" and select your workspace

### 2. Configure Permissions

Add the following **Bot Token Scopes**:

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

### 5. Subscribe Repositories

Per-repository settings:
1. Go to **Repository** → **Settings** → **Integrations**
2. Enable Slack notifications
3. Choose channel and events

## Slash Commands

```
/och prs [repo]           List open PRs
/och review <pr-number>   Quick review a PR
/och queue [repo]         Show merge queue status
/och issues [repo]        List open issues
```

## Troubleshooting

### "Notifications not appearing"

1. Verify the bot is invited to the channel (`/invite @OpenCodeHub`)
2. Check repository subscription settings
3. Verify `SLACK_BOT_TOKEN` is correct

### "Too many notifications"

- Enable notification batching
- Filter by event type in repository settings
- Use `@mentions` only mode for noisy repos
