---
title: "Automation & Insights"
description: "Automations, notifications, inbox, and metrics from the CLI."
---

## Automation rules

Automation rules run when triggers fire (like PR opened or CI passed). Use the CLI to manage them per repository.

```bash
och automate list
och automate create
och automate enable "AI Review on PR"
och automate disable "AI Review on PR"
och automate delete "AI Review on PR"
```

> `och automate create` is interactive and guides you through triggers and actions.

## Notifications

```bash
och notify list --unread
och notify read --all
och notify settings --show
```

The CLI can list and mark notifications, as well as toggle preferences and quiet hours interactively.

## PR inbox

```bash
och inbox list
och inbox list --section "Needs Review"
och inbox section list
och inbox section create
och inbox section delete "Needs Review"
```

Sections support filters like:

- Needs my review
- Authored by me
- CI passing
- Ready to merge
- Has conflicts

## Metrics & insights

```bash
och metrics show --weeks 4
och metrics show --repo --weeks 8

och insights show --period 4w
och insights team --period 4w --limit 10
och insights repo
```

Use `metrics` for structured summaries and `insights` for leaderboard‑style views.
