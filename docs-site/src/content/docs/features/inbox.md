---
title: "PR Inbox"
description: "Organize reviews with inbox sections and filters."
---

The PR inbox is a focused view for reviewing and triaging pull requests.

## Inbox sections

Sections group PRs using reusable filters. Default filters include:

- **Needs my review**
- **Authored by me**
- **CI passing**
- **Ready to merge**
- **Has conflicts**

## CLI support

```bash
och inbox list
och inbox section list
och inbox section create
och inbox section delete "Needs Review"
```

Use `och inbox list --section "Section Name"` to filter by a section.

## Best practices

- Keep a **Needs my review** section pinned.
- Create a **Ready to merge** section for final checks.
- Use **Has conflicts** to surface blocked work quickly.
