# Stacked Pull Requests

> Break large features into small, reviewable changes that ship faster

Stacked Pull Requests (Stacked PRs) is a development workflow that allows you to break large features into a series of small, dependent pull requests. Each PR in the stack builds on the previous one, enabling faster reviews and parallel development.

## 📖 Table of Contents

- [Why Stacked PRs?](#why-stacked-prs)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
  - [Creating Your First Stack](#creating-your-first-stack-web-ui)
  - [Using the CLI](#creating-a-stack-with-och-cli)
- [Managing Stacks](#managing-stacks)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Why Stacked PRs?

### The Problem with Large PRs

Large pull requests are:
- ⏰ **Slow to review** - Reviewers get overwhelmed
- 🐛 **More bugs** - Hard to spot issues in 1000+ line diffs
- 🔄 **Conflict-prone** - More changes = more merge conflicts
- 📦 **Risky to deploy** - Big changes = big risk

### The Stacked PR Solution

Stacked PRs solve these problems by:

✅ **Faster Reviews** - Small, focused PRs get reviewed in minutes, not days  
✅ **Better Code Quality** - Reviewers can focus on specific changes  
✅ **Parallel Development** - Build on unmerged PRs while waiting for review  
✅ **Easier Rollback** - Deploy incrementally, rollback specific changes  
✅ **Clear History** - Each PR tells a story

### Real-World Example

**Without Stacks (Traditional):**
```
PR #1: Add user authentication system (2,500 lines, 45 files)
└─ Review time: 3-5 days, high defect rate
```

**With Stacks:**
```
PR #1: Add user database schema (100 lines, 2 files)
└─ Review time: 15 minutes ✅

PR #2: Add auth service layer (200 lines, 3 files) [depends on #1]
└─ Review time: 30 minutes ✅

PR #3: Add login/logout endpoints (150 lines, 4 files) [depends on #2]
└─ Review time: 20 minutes ✅

PR #4: Add login UI (180 lines, 5 files) [depends on #3]
└─ Review time: 25 minutes ✅

Total review time: ~1.5 hours (vs. 3-5 days)
```

---

## How It Works

### Stack Visualization

```
main branch
 └── PR #123: Add database schema ✅ MERGED
      └── PR #124: Add auth service  🔍 IN REVIEW
           └── PR #125: Add login UI ⏳ WAITING
```

### Auto-Rebasing

When PR #123 merges into main:
1. OpenCodeHub automatically rebases PR #124 onto the updated main
2. PR #125 is rebased onto the updated #124
3. No manual work required! 🎉

### Dependency Tracking

OpenCodeHub tracks dependencies automatically:
- Visual stack graph in PR view
- Auto-merge in correct order
- Conflict detection
- Status propagation

---

## Getting Started

### Prerequisites

- OpenCodeHub account
- Repository with write access
- Git installed locally (or use web UI)

### Creating Your First Stack (Web UI)

**Step 1: Create Base PR**

1. Create a feature branch: `git checkout -b feature/user-auth`
2. Make your first change (e.g., database schema)
3. Commit: `git commit -m "Add user table schema"`
4. Push: `git push origin feature/user-auth`
5. Create PR via web UI: `http://your-instance/owner/repo/compare`

**Step 2: Stack Second PR**

1. Create second branch from first: `git checkout -b feature/auth-service`
2. Make your changes
3. Commit: `git commit -m "Add authentication service"`
4. Push: `git push origin feature/auth-service`
5. When creating PR, select **"Stack on PR #123"** in the PR creation form

**Step 3: Continue Stacking**

Repeat the process for each layer of your feature!

### Creating a Stack with OCH CLI

The CLI makes stacking even easier:

```bash
# 1. Start from main
git checkout main
git pull

# 2. Create first branch
och stack create user-schema
# ... make changes ...
git add .
git commit -m "Add user table schema"

# 3. Create second branch (automatically stacks)
och stack create auth-service
# ... make changes ...
git add .
git commit -m "Add authentication service"

# 4. Create third branch
och stack create login-ui
# ... make changes ...
git add .
git commit -m "Add login UI"

# 5. Submit entire stack
och stack submit

# Result: 3 PRs created, automatically linked!
```

Install OCH CLI:
```bash
npm install -g opencodehub-cli
och auth login
```

---

## Managing Stacks

### Viewing Your Stack

**Web UI:**
- Navigate to any PR in the stack
- See **"Stack View"** panel showing all related PRs
- Visual dependency graph

**CLI:**
```bash
och stack view

# Output:
# 📚 Current Stack
#   ┌─ main (base)
#   ├─ #123: user-schema ✅ Merged
#   ├─ #124: auth-service 🔍 In Review
#   └─ #125: login-ui ⏳ Draft
```

### Updating a PR in the Stack

When you need to make changes:

```bash
# Checkout the branch
git checkout feature/auth-service

# Make changes
# ... edit files ...

# Commit and push
git add .
git commit -m "Address review feedback"
git push

# OpenCodeHub automatically updates dependent PRs if needed
```

### Syncing the Stack

If main branch advances while your stack is in review:

```bash
# Automatically rebase entire stack
och stack sync

# Or manually:
git checkout feature/user-schema
git rebase main
git push --force-with-lease

# Repeat for each branch in stack
```

### Merging the Stack

**Option 1: Merge One at a Time**
1. Get PR #123 approved → Merge
2. OpenCodeHub auto-rebases #124 onto main
3. Get #124 approved → Merge
4. #125 auto-rebases
5. Get #125 approved → Merge

**Option 2: Use Merge Queue**
```bash
# Add all PRs to merge queue
och queue add 123
och queue add 124
och queue add 125

# Queue handles:
# - Waiting for approvals
# - Running CI for each
# - Merging in correct order
# - Auto-rebasing
```

---

## Best Practices

### 💡 Stack Size

**Ideal stack:**
- 3-5 PRs per stack
- Each PR: 100-300 lines
- Each PR: Single, focused change

**Too deep?** Consider splitting into multiple independent stacks.

### 💡 PR Descriptions

Make each PR standalone:

```markdown
# Bad
"Part 2 of user auth"

# Good
"Add authentication service layer

Depends on: #123 (database schema)

This PR adds:
- JWT token generation
- Password hashing with bcrypt
- Session management

The next PR will add the API endpoints."
```

### 💡 Commit Messages

Use conventional commits:

```bash
feat: add user authentication schema
feat: implement JWT token service
feat: add login/logout endpoints
feat: create login UI component
```

### 💡 Testing

Test each layer:

```bash
# In PR #123
npm test -- auth/schema.test.ts

# In PR #124
npm test -- auth/service.test.ts

# In PR #125
npm test -- components/Login.test.tsx
```

### 💡 Review Strategy

**For Reviewers:**
- Review PRs in order (bottom → top)
- Approve quickly to unblock the stack
- Focus on the specific change in each PR

**For Authors:**
- Mark early PRs as "Ready for Review" immediately
- Keep later PRs as "Draft" until earlier ones are approved
- Be responsive to feedback

### 💡 Deployment

Deploy incrementally:

```bash
# Deploy PR #123
✅ Database migration - SAFE

# Deploy PR #124  
✅ Service layer - SAFE (no API changes yet)

# Deploy PR #125
✅ Login UI - COMPLETE FEATURE

# Each deployment is low-risk!
```

---

## Troubleshooting

### "My stack has merge conflicts"

**Cause:** Base branch (main) changed while your stack was in review.

**Solution:**
```bash
# Sync the entire stack
och stack sync

# Or manually rebase each branch
git checkout feature/user-schema
git fetch origin
git rebase origin/main
git push --force-with-lease

# Then update dependent branches
git checkout feature/auth-service
git rebase feature/user-schema
git push --force-with-lease

# Repeat for each branch
```

### "Auto-rebase failed"

**Cause:** Conflicting changes in dependent PRs.

**Solution:**
1. Check PR comments for conflict details
2. Manually resolve conflicts:
   ```bash
   git checkout feature/auth-service
   git rebase feature/user-schema
   # Resolve conflicts
   git add .
   git rebase --continue
   git push --force-with-lease
   ```

### "Can't create stack - PR not found"

**Cause:** Base PR might not exist or is already merged.

**Solution:**
```bash
# Check PR status
och pr status 123

# Verify branch exists
git branch -a | grep feature/user-schema

# Recreate if needed
git checkout -b feature/new-base main
```

### "Stack order is wrong"

**Cause:** PRs created in wrong order or dependencies changed.

**Solution:**
```bash
# Reorder stack
och stack reorder

# Or manually update dependencies in web UI:
# PR Settings → Dependencies → Change base PR
```

### "Too many PRs in my stack"

**Cause:** Stack grew too large (>5 PRs).

**Solution:**
1. Merge bottom PRs first
2. Start a new stack for remaining changes
3. Or split into parallel stacks

---

## Advanced: Parallel Stacks

You can work on multiple independent stacks simultaneously:

```
main
 ├── Stack A: User Authentication
 │    ├── PR #123: DB schema
 │    ├── PR #124: Service layer
 │    └── PR #125: Login UI
 │
 └── Stack B: Payment Integration
      ├── PR #126: Payment models
      ├── PR #127: Stripe integration
      └── PR #128: Checkout page
```

**CLI:**
```bash
# View all stacks
och stack list

# Switch between stacks
git checkout feature/auth-stack
git checkout feature/payment-stack
```

---

## See Also

- [OCH CLI Reference](../../cli/README.md)
- [Smart Merge Queue](merge-queue.md)
- [CI/CD Integration](ci-cd.md)
- [Tutorial: Your First Stack](../tutorials/your-first-stack.md)

---

## Need Help?

- 💬 [Discord Community](https://discord.gg/opencodehub)
- 🐛 [Report Issues](https://github.com/swadhinbiswas/OpencodeHub/issues)
- 📖 [Full Documentation](/)
