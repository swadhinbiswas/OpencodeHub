---
title: "Smart Merge Queue"
slug: "features/merge-queue"
---

# Smart Merge Queue

> Automate merging with stack-aware CI optimization and conflict resolution

The Smart Merge Queue automatically merges approved pull requests in the correct order, running CI efficiently and handling rebases automatically.

## �� Table of Contents

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
✅ **CI Optimization** - Batches compatible PRs
✅ **Conflict Resolution** - Auto-rebases or alerts
✅ **Priority Handling** - Hotfixes jump the queue

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
Auto-rebases #124 →
Batches #124 + #125 for CI (if compatible) →
Merges both
Total: ~8 minutes, 1-2 CI runs 🎉
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
   - Conflicts? Auto-rebase
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

### CI Optimization

**Batching:**

```
PR #126: Fix typo in docs (no code changes)
PR #127:  Update README
PR #128: Fix CSS bug

Queue batches #126 + #127 (docs only)
→ Single CI run
→ Merge both together
→ 50% CI cost savings!
```

**Smart Scheduling:**

- Long CI jobs run in parallel
- Short jobs batch together
- Stack dependencies respected

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

# Add multiple PRs
och queue add 123 124 125

# Add with priority (hotfix)
och queue add 126 --priority high

# Add when approved
och queue add 127 --when approved
```

**Via API:**

```bash
curl -X POST https://git.yourcompany.com/api/queue \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"pr_id": 125, "priority": "normal"}'
```

### Viewing Queue Status

**Web UI:**
Navigate to `/queue` or click "Merge Queue" in repository navigation

**CLI:**

```bash
# View entire queue
och queue list

# Output:
# Position  PR     Title              Status        ETA
# 1         #125   Login UI           🏃 Running CI  2 min
# 2         #124   Auth service       ⏳ Waiting     5 min
# 3         #123   Database schema    ✅ Ready       7 min
# 4         #126   Hotfix: XSS        🔥 Priority    1 min

# Watch queue in real-time
och queue watch
```

**API:**

```bash
curl https://git.yourcompany.com/api/queue \
  -H "Authorization: Bearer $TOKEN"
```

---

## Queue Management

### Priority Levels

| Priority        | Use Case             | Behavior                            |
| --------------- | -------------------- | ----------------------------------- |
| 🔥 **Critical** | Production outage    | Jumps to front, blocks other merges |
| ⚡ **High**     | Security fix, hotfix | Merges before normal PRs            |
| 📄 **Normal**   | Regular features     | Default, FIFO order                 |
| 🐌 **Low**      | Refactoring, docs    | Merges when queue is empty          |

**Setting priority:**

```bash
# CLI
och queue add 126 --priority critical

# Web UI: Select priority dropdown when adding to queue
```

### Removing from Queue

```bash
# Remove specific PR
och queue remove 125

# Remove all your PRs
och queue remove --mine

# Clear entire queue (admin only)
och queue clear
```

### Pausing the Queue

```bash
# Pause (emergency)
och queue pause --reason "Investigating production issue"

# Resume
och queue resume
```

---

## Configuration

### Repository Settings

**Repository → Settings → Merge Queue**

```yaml
# Merge strategy
merge_method: squash # or merge, rebase

# CI requirements
require_ci: true
required_checks:
  - "test"
  - "lint"
  - "build"

# Approval requirements
require_approvals: 1
dismiss_stale_reviews: true

# Batching
enable_batching: true
batch_window: 5m # Wait 5 min to batch PRs
max_batch_size: 3 # Max 3 PRs per batch

# Rebasing
auto_rebase: true # Auto-rebase on conflicts
rebase_strategy: merge # or rebase, squash

# Priorities
allow_priority_override: true # Let users set priority
max_queue_size: 50 # Max PRs in queue
```

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
curl -X POST https://git.yourcompany.com/api/webhooks \
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

```yaml
# Run quick tests in queue
queue_ci:
  - unit_tests # 2 min

# Run slow tests post-merge
post_merge_ci:
  - integration_tests # 10 min
  - e2e_tests # 15 min
```

**2. Parallel CIs:**

```yaml
# Run multiple jobs in parallel
ci:
  - test (3 min)
  - lint (1 min)
  - build (2 min)
# Total: 3 min (not 6 min!)
```

**3. Smart batching:**

```bash
# Group related PRs
och queue add 123 124 125 --batch-id feature-auth

# Queue runs CI once for entire batch
```

### 💡 Handling Conflicts

**Automatic resolution:**

```yaml
auto_rebase: true
rebase_strategy: merge  # Creates merge commit

# Or:
rebase_strategy: rebase  # Cleaner history
```

**Manual resolution:**

```bash
# If auto-rebase fails, you'll get notification
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

1. Queue paused
2. CI service down
3. Rate limit reached

**Solutions:**

```bash
# Check queue status
och queue info

# Resume if paused
och queue resume

# Check CI status
curl https://ci-service/status

# View queue system logs (admin)
och admin logs queue
```

### "Wrong merge order"

**Cause:** Dependencies not detected.

**Solution:**

```bash
# Manually set dependency
och pr edit 125 --depends-on 124

# Queue will automatically reorder
```

---

## Advanced Features

### Merge Train

For high-velocity teams:

```yaml
# Merge up to 5 PRs simultaneously
merge_train:
  enabled: true
  max_concurrent: 5

# Creates temporary integration branches
# Runs CI in parallel
# Merges in rapid succession
```

### Scheduled Merges

```bash
# Merge during business hours only
och queue add 125 --schedule "Mon-Fri 9am-5pm EST"

# Merge during maintenance window
och queue add 126 --schedule "Sat 2am-4am EST"
```

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
