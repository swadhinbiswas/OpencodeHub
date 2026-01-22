---
title: "Legacy: Your First Stacked PR"
slug: "legacy/tutorials/your-first-stack"
---

# Tutorial: Your First Stacked PR

> Learn how to split a large feature into reviewable chunks in 15 minutes

This hands-on tutorial teaches you how to use Stacked Pull Requests to break down a large feature into small, focused PRs that ship faster.

## What You'll Learn

- Create a stack of 3 dependent PRs
- Use the OCH CLI for efficient workflow
- Navigate the review process
- Merge the stack successfully

**Time:** 15-20 minutes
**Difficulty:** Beginner

---

## Prerequisites

Before starting, make sure you have:

- [ ] OpenCodeHub account
- [ ] A repository where you have write access
- [ ] Git installed locally
- [ ] OCH CLI installed (`npm install -g opencodehub-cli`)
- [ ] Basic Git knowledge (branch, commit, push)

**First time with OCH CLI?**

```bash
# Install
npm install -g opencodehub-cli

# Login
och auth login
# Enter your email and password when prompted
```

---

## The Scenario

You're building a **user authentication system**. Instead of creating one massive PR, you'll split it into 3 logical layers:

1. **Database Layer** - User table schema
2. **Service Layer** - Authentication logic
3. **API Layer** - Login/logout endpoints

Each PR builds on the previous one, but can be reviewed independently.

---

## Step 1: Set Up Your Workspace (2 min)

**1.1. Clone your repository:**

```bash
cd ~/projects
git clone https://github.com/yourorg/your-repo.git
cd your-repo
```

**1.2. Ensure main is up to date:**

```bash
git checkout main
git pull origin main
```

**1.3. Verify OCH CLI is connected:**

```bash
och auth whoami
# Should show: "Logged in as: your-email@example.com"
```

---

## Step 2: Create the Database Layer PR (4 min)

This is the foundation of your stack.

**2.1. Create the first branch:**

```bash
och stack create auth-database
```

This creates a new branch `stack/auth-database` from `main`.

**2.2. Create the migration file:**

```bash
mkdir -p db/migrations
cat > db/migrations/001_create_users_table.sql << 'EOF'
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
EOF
```

**2.3. Commit your changes:**

```bash
git add db/migrations/
git commit -m "feat: add users table migration

- Create users table with email and password_hash
- Add email index for fast lookups
- Set up timestamps"
```

**2.4. Submit to create the PR:**

```bash
och stack submit

# Output:
# ✓ Pushing stack/auth-database
# ✓ Creating pull request
#
# PR #123 created: feat: add users table migration
# https://git.yourcompany.com/yourorg/your-repo/pulls/123
```

**2.5. Verify in web UI:**

Open the PR link. You should see:

- Title: "feat: add users table migration"
- Files changed: `db/migrations/001_create_users_table.sql`
- Status: Draft or Ready for Review

---

## Step 3: Create the Service Layer PR (4 min)

Now, build on top of your first PR.

**3.1. Create the second stacked branch:**

```bash
och stack create auth-service
```

This creates `stack/auth-service` from your current branch automatically.

**3.2. Create the auth service:**

```bash
mkdir -p src/services
cat > src/services/auth.ts << 'EOF'
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../db';

export class AuthService {
  async register(email: string, password: string) {
    const hash = await bcrypt.hash(password, 10);

    const user = await db.users.create({
      email,
      password_hash: hash
    });

    return { id: user.id, email: user.email };
  }

  async login(email: string, password: string) {
    const user = await db.users.findByEmail(email);

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    return { token, user: { id: user.id, email: user.email } };
  }
}
EOF
```

**3.3. Commit:**

```bash
git add src/services/
git commit -m "feat: implement authentication service

- Add user registration with bcrypt hashing
- Add login with JWT token generation
- Implement password verification

Depends on: PR #123 (users table)"
```

**3.4. Submit:**

```bash
och stack submit

# Output:
# ✓ Pushing stack/auth-service
# ✓ Creating pull request
# ✓ Linking to base PR #123
#
# PR #124 created: feat: implement authentication service
# Stack: #123 → #124
# https://git.yourcompany.com/yourorg/your-repo/pulls/124
```

**3.5. Check the stack:**

```bash
och stack view

# Output:
# 📚 Current Stack
#   ┌─ main (base)
#   ├─ #123: auth-database ⏳ Draft
#   └─ #124: auth-service  ⏳ Draft
```

Perfect! You now have a stack of 2 PRs.

---

## Step 4: Create the API Layer PR (4 min)

Final layer: the HTTP endpoints.

**4.1. Create third branch:**

```bash
och stack create auth-api
```

**4.2. Create API endpoints:**

```bash
mkdir -p src/api
cat > src/api/auth.ts << 'EOF'
import { Router } from 'express';
import { AuthService } from '../services/auth';

const router = Router();
const authService = new AuthService();

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await authService.register(email, password);

    res.status(201).json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await authService.login(email, password);

    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

export default router;
EOF
```

**4.3. Commit and submit:**

```bash
git add src/api/
git commit -m "feat: add authentication API endpoints

- POST /register - create new user
- POST /login - authenticate and get token
- Input validation
- Error handling

Depends on: PR #124 (auth service)"

och stack submit

# Output:
# ✓ Pushing stack/auth-api
# ✓ Creating pull request
# ✓ Linking to base PR #124
#
# PR #125 created: feat: add authentication API endpoints
# Stack: #123 → #124 → #125
```

**4.4. View complete stack:**

```bash
och stack view

# Output:
# 📚 Current Stack
#   ┌─ main (base)
#   ├─ #123: auth-database  ⏳ Draft
#   ├─ #124: auth-service   ⏳ Draft
#   └─ #125: auth-api       ⏳ Draft (current)
```

🎉 **Congratulations!** You've created your first stack of 3 PRs!

---

## Step 5: Navigate the Review Process (3 min)

Now let's get these PRs reviewed and merged.

**5.1. Mark PRs as ready:**

```bash
# Mark first PR ready for review
curl -X PATCH https://git.yourcompany.com/api/prs/123 \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"draft": false}'

# Or via web UI: Click "Ready for Review" on PR #123
```

**5.2. Request reviews:**

In the web UI for PR #123:

1. Click "Reviewers" → Select team members
2. Add comment: "This is the first PR in a stack of 3. Reviewing these in order would be helpful!"

**5.3. While waiting, add tests:**

```bash
# Switch back to first branch
git checkout stack/auth-database

# Add test file
cat > db/migrations/001_create_users_table.test.ts << 'EOF'
import { test } from 'vitest';
import { db } from '../db';

test('creates users table', async () => {
  // Run migration
  await db.migrate();

  // Verify table exists
  const tables = await db.raw(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_name = 'users'
  `);

  expect(tables.length).toBe(1);
});
EOF

git add .
git commit -m "test: add migration test"
git push

# PR #123 automatically updates!
```

**5.4. Monitor review progress:**

```bash
# Check PR status
och pr status 123

# Output:
# PR #123: feat: add users table migration
# Status: 🔍 In Review
# Approvals: 1/1 required
# CI: ✅ Passing
# Comments: 2
```

---

## Step 6: Merge the Stack (2 min)

Once PR #123 is approved, the magic happens!

**6.1. Use the merge queue:**

```bash
# Add all PRs to queue
och queue add 123 124 125

# Or add individually as they get approved:
och queue add 123  # Merges first
# PR #124 auto-rebases onto new main
och queue add 124  # Merges second
# PR #125 auto-rebases onto new main
och queue add 125  # Merges third
```

**6.2. Watch it merge automatically:**

```bash
# Monitor queue
och queue watch

# Output (live updates):
# Position  PR     Status           ETA
# 1         #123   🏃 Running CI     1 min
# 2         #124   ⏳ Waiting        3 min
# 3         #125   ⏳ Waiting        5 min
#
# [1 min later]
# ✅ PR #123 merged!
# 🔄 Rebasing PR #124...
# 🏃 Running CI for #124...
#
# [2 min later]
# ✅ PR #124 merged!
# 🔄 Rebasing PR #125...
```

**6.3. Celebrate! 🎉**

```bash
# Check final status
git checkout main
git pull

git log --oneline -3

# Output:
# abc123 feat: add authentication API endpoints
# def456 feat: implement authentication service
# ghi789 feat: add users table migration
```

All 3 PRs merged! Your auth system is live!

---

## What You've Learned

✅ How to create a stack of dependent PRs
✅ Using `och stack create` for easy stacking
✅ Submitting stacks with `och stack submit`
✅ Viewing stack visualization
✅ Using the merge queue for automatic merging
✅ How auto-rebasing works

## Key Takeaways

**Stacked PRs are better because:**

- Each PR was ~50-100 lines (easy to review)
- Reviews happened in parallel (faster)
- Each merge was low-risk (incremental)
- Clear history (logical progression)

**vs. One Large PR:**

- Would be ~200-300 lines
- Single review bottleneck
- High-risk merge
- Messy history

---

## Next Steps

### Practice More

Try stacking your next feature:

- 🎨 Frontend feature → Split UI, logic, styles
- 🔧 Backend feature → Split models, services, controllers
- 📊 Data pipeline → Split ingestion, processing, output

### Advanced Techniques

Learn more about:

- [Parallel stacks](../features/stacked-prs.md#parallel-stacks)
- [Stack reordering](../features/stacked-prs.md#reordering)
- [AI code review](../features/ai-review.md) on stacks
- [Advanced CLI commands](../../cli/README.md)

### Join the Community

- 💬 [Discord](https://discord.gg/opencodehub) - Ask questions
- 📖 [Documentation](/) - Read more guides
- 🐛 [GitHub](https://github.com/swadhinbiswas/OpencodeHub) - Report issues

---

## Troubleshooting

**"och command not found"**

```bash
# Install CLI
npm install -g opencodehub-cli

# Or use npx
npx opencodehub-cli stack create auth-database
```

**"Permission denied"**

```bash
# Login again
och auth login

# Verify permissions
och auth whoami
```

**"Can't create stack - conflicts"**

```bash
# Make sure main is up to date
git checkout main
git pull

# Start fresh
git checkout -b stack/auth-database main
```

**"PR not linking to stack"**

```bash
# Manually link via web UI:
# Go to PR → Settings → Dependencies → Select base PR
```

---

**Congratulations on completing your first stacked PR workflow!** 🚀

You're now ready to ship code faster with OpenCodeHub.
