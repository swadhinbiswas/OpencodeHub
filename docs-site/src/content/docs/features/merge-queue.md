---
title: "Smart Merge Queue"
---

> Automate merging with stack-aware CI optimization and conflict resolution

The Smart Merge Queue automatically merges approved pull requests in the correct order, running CI efficiently and handling rebases automatically.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Queue Management](#queue-management)
- [Configuration](#configuration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

### The Problem

Manual merging is:

- ⏰ **Slow** - Wait for CI, merge, repeat
- 🐛 **Error-prone** - Merge conflicts, wrong order
- 💸 **Expensive** - Run CI for every PR individually
- 😓 **Tedious** - Babysit the merge process

### The Solution

Smart Merge Queue:

✅ **Automatic Merging** - Set it and forget it
✅ **Stack-Aware** - Merges in dependency order
✅ **CI Validation** - Ensures checks pass for latest commits
✅ **Priority Handling** - Higher priority merges sooner

### Real-World Impact

**Without Queue:**

```
PR #123 → Wait for CI (5 min) → Merge →
PR #124 → Rebase → Wait for CI (5 min) → Merge →
PR #125 → Rebase → Wait for CI (5 min) → Merge
Total: ~20 minutes, 3 CI runs
```

**With Queue:**

```
Add #123, #124, #125 to queue →
Queue detects dependencies →
Merges #123 →
Validates CI for #124 →
Merges #124 →
Validates CI for #125 →
Merges #125
Total: fewer manual steps and a consistent, ordered merge flow 🎉
```

---

## How It Works

### Queue Flow

```
1. PR gets approved
    ↓
2. Add to merge queue
    ↓
3. Queue checks:
   - All approvals? ✓
   - CI passing? ✓
  - Conflicts? Block and report
   - Dependencies? Order correctly
    ↓
4. Run final CI check
    ↓
5. Merge to main
    ↓
6. Update dependent PRs
```

### Stack-Aware Merging

Queue understands stacks:

```
Queue contains:
- PR #123 (base)
- PR #124 (depends on #123)
- PR #125 (depends on #124)

Queue automatically:
1. Merges #123 first
2. Rebases #124 onto new main
3. Runs CI for #124
4. Merges #124
5. Rebases #125
6. Merges #125

All automatic!
```

### CI Validation

Before merging, the queue verifies:

- All required approvals are present
- Latest CI results for the PR’s head SHA are successful
- Stack dependencies are merged in order

---

## Getting Started

### Prerequisites

- Repository with CI configured
- Merge permissions
- Branch protection (optional but recommended)

### Adding PR to Queue

**Via Web UI:**

1. Open approved PR
2. Click **"Add to Merge Queue"** button
3. PR status changes to "In Queue"
4. Watch it merge automatically!

**Via CLI:**

```bash
# Add single PR
och queue add 125

# Add with numeric priority (higher = sooner)
och queue add 126 --priority 5
```

**Via API:**

```bash
curl -X POST https://git.yourcompany.com/api/repos/OWNER/REPO/merge-queue \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"pullRequestNumber": 125, "priority": 0, "mergeMethod": "merge"}'
```

### Viewing Queue Status

**Web UI:**
Navigate to `/queue` or click "Merge Queue" in repository navigation

**CLI:**

```bash
# View entire queue
och queue list
```

**API:**

```bash
curl https://git.yourcompany.com/api/repos/OWNER/REPO/merge-queue \
  -H "Authorization: Bearer $TOKEN"
```

---

## Queue Management

### Priority

Priority is numeric. Higher values are processed sooner. Default is `0`.

```bash
och queue add 126 --priority 5
```

### Removing from Queue

```bash
# Remove specific PR
och queue remove 125
```

### Pausing the Queue

Pausing and resuming the queue is managed in the web UI.

---

## Configuration

### Repository Settings

Queue behavior is enforced by:

- **Branch protection rules** (required approvals, required checks)
- **CI status** for the PR’s latest commit
- **Per‑entry merge method** chosen when adding to the queue

Configuration is managed in the repository settings UI.

### Branch Protection Rules

Recommended settings:

```yaml
# .github/branch-protection.yml
branches:
  main:
    required_status_checks:
      - test
      - lint
    required_approvals: 1
    allow_force_push: false
    allow_queue_bypass: false # Even admins use queue!
```

### Webhook Notifications

Get notified when PRs merge:

```bash
# Configure webhook
curl -X POST https://git.yourcompany.com/api/repos/OWNER/REPO/webhooks \
  -d '{
    "url": "https://yourapp.com/webhook",
    "events": ["merge_queue.merged", "merge_queue.failed"],
    "secret": "your-secret"
  }'
```

**Payload:**

```json
{
  "event": "merge_queue.merged",
  "pr": {
    "number": 125,
    "title": "Add login UI",
    "author": "swadhin"
  },
  "queue": {
    "position": 1,
    "wait_time_seconds": 180
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

---

## Best Practices

### 💡 When to Use the Queue

**✅ Always use for:**

- Feature branches → main
- Release branches
- Any PR affecting production

**❌ Don't use for:**

- Draft PRs
- WIP branches
- Experimental features

### 💡 Optimizing Queue Performance

**1. Fast CI:**
Keep queue checks short and focused. Run slower or optional suites after merge.

**2. Parallel CI:**
Split workflows into parallel jobs to reduce total wall‑clock time.

**3. Small PRs:**
Smaller, focused PRs reduce queue time and review delays.

### 💡 Handling Conflicts

**Manual resolution:**

```bash
# If a conflict blocks the queue, you'll get a notification
# Fix locally:
git checkout feature-branch
git fetch origin
git rebase origin/main
# Resolve conflicts
git push --force-with-lease

# PR automatically re-enters queue
```

### 💡 Queue Monitoring

**Set up alerts:**

```yaml
# Slack notification if queue stalled
alerts:
  - type: queue_stalled
    threshold: 30m
    channel: "#eng-deployments"

  - type: merge_failed
    channel: "#eng-alerts"
```

**Dashboard example:**

```bash
# View queue health
och queue stats

# Output:
# Queue Health: ✅ Good
# - Average wait time: 4.2 min
# - CI success rate: 94%
# - Merge rate: 15 PRs/hour
# - Current size: 8 PRs
```

---

## Troubleshooting

### "PR stuck in queue"

**Causes:**

1. CI failing
2. Waiting for approval
3. Merge conflict
4. Dependency not merged yet

**Solutions:**

```bash
# Check status
och queue status 125

# View logs
och queue logs 125

# Remove and re-add
och queue remove 125
# Fix issue
och queue add 125
```

### "Auto-rebase failed"

**Cause:** Complex merge conflicts.

**Solution:**

```bash
# Remove from queue
och queue remove 125

# Manually rebase
git checkout feature-branch
git rebase origin/main
# Resolve conflicts
git push -f

# Re-add to queue
och queue add 125
```

### "Queue not processing"

**Causes:**

1. CI checks failing or still running
2. Required approvals missing
3. The PR is not in the queue

**Solutions:**

```bash
# Check the queue
och queue list

# Inspect the PR
och pr view 125
```

### "Wrong merge order"

**Cause:** Stack dependency is missing or incorrect.

**Solution:**

- Ensure PRs are created as a stack (base PR first, then dependents).
- Re‑submit the stack with the CLI if needed.

---

## Roadmap ideas

Future improvements may include merge trains and scheduled merges. If these are important for your team, open an issue with your use case.

### Queue Hooks

Custom automation:

```javascript
// .opencodehub/hooks/queue.js
module.exports = {
  beforeMerge(pr) {
    // Send Slack notification
    // Update JIRA ticket
    // Trigger deployment
  },

  afterMerge(pr) {
    // Create release notes
    // Update documentation
  },
};
```

---

## See Also

- [Stacked Pull Requests](stacked-prs.md)
- [AI Code Review](ai-review.md)
- [CI/CD Integration](ci-cd.md)
- [Webhooks](../guides/webhooks.md)

---

## Need Help?

- 💬 [Discord Community](https://discord.gg/opencodehub)
- 🐛 [Report Issues](https://github.com/swadhinbiswas/OpencodeHub/issues)
- 📖 [Full Documentation](/)
