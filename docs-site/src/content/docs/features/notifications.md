---
title: "Notifications"
description: "Stay informed across in‑app, email, Slack, and browser channels."
---

OpenCodeHub supports multi‑channel notifications with per‑event preferences.

## Channels

- In‑app notifications
- Email
- Slack
- Browser push

## Event types

Common events include:

- `mention`
- `assign`
- `review_request`
- `review_submitted`
- `pr_approved`
- `pr_changes_requested`
- `pr_merged`
- `pr_closed`
- `comment`
- `ci_passed`
- `ci_failed`
- `merge_queue`
- `stack_update`
- `ai_review`
- `star`
- `watching`

## Quiet hours & digest

You can define quiet hours and digest schedules to reduce noise. These settings are available in user notification preferences and can be managed via the CLI.

```bash
och notify settings --show
```

## CLI usage

```bash
och notify list --unread
och notify read --all
```

## Tips

- Turn on Slack for `review_request` and `merge_queue` events.
- Use quiet hours to avoid off‑hours alerting.
- Combine with automation rules for consistent team practices.
