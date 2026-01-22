---
title: "Automation Rules"
description: "Automate PR workflows with triggers, conditions, and actions."
---

Automation rules let you react to repository events and apply consistent workflow policies.

## Triggers

Supported trigger types include:

- `pr_opened`
- `pr_updated`
- `pr_review_requested`
- `pr_approved`
- `pr_changes_requested`
- `pr_merged`
- `pr_closed`
- `ci_passed`
- `ci_failed`
- `label_added`
- `label_removed`
- `comment_added`
- `stack_created`
- `stack_updated`

## Actions

Supported actions include:

- `add_label`
- `remove_label`
- `assign_reviewer`
- `assign_user`
- `add_to_merge_queue`
- `remove_from_merge_queue`
- `add_comment`
- `trigger_ai_review`
- `notify_slack`
- `close_pr`
- `request_changes`

## Example rules

- When a PR is opened, add `needs-review` and trigger AI review.
- When CI passes, add the PR to the merge queue with `squash`.
- When a label is added, assign a reviewer.

## Manage rules

You can configure rules in the UI under **Settings → Automations** or via the CLI:

```bash
och automate list
och automate create
och automate enable "AI Review on PR"
och automate disable "AI Review on PR"
och automate delete "AI Review on PR"
```
