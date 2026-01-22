---
title: "Developer Metrics"
description: "Track PR velocity, review efficiency, and team health."
---

OpenCodeHub tracks PR and review metrics so teams can measure flow and spot bottlenecks.

## What’s tracked

- PRs opened and merged
- Time to first review
- Time to merge
- Review rounds (number of change‑request cycles)
- Review counts (approvals and changes requested)
- PR size (lines added/removed, files changed)
- Stack awareness (stack position and stacked vs non‑stacked)

## Where metrics appear

- **User insights**: your personal throughput and review cadence.
- **Repository metrics**: activity trends, top authors, and top reviewers.

## CLI access

```bash
och metrics show --weeks 4
och metrics show --repo --weeks 8

och insights show --period 4w
och insights team --period 4w --limit 10
och insights repo
```

## Tips

- Use smaller PRs to reduce time to first review.
- Automate AI review for early feedback.
- Monitor review rounds to detect flaky CI or unclear PR scope.
