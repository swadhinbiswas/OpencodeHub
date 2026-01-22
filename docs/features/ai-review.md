---
title: "Legacy: AI Code Review"
slug: "legacy/features/ai-review"
---

# AI Code Review

> Get instant, intelligent code reviews powered by GPT-4 or Claude

AI Code Review uses advanced language models to automatically review your pull requests, catching bugs, security issues, and code quality problems before they reach production.

## 📖 Table of Contents

- [Overview](#overview)
- [Setup](#setup)
  - [Configure AI Provider](#configure-ai-provider)
  - [Enable for Repository](#enable-for-repository)
- [Using AI Review](#using-ai-review)
- [Understanding Review Output](#understanding-review-output)
- [Customizing Reviews](#customizing-reviews)
- [Cost Considerations](#cost-considerations)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

### What AI Review Catches

🔒 **Security Vulnerabilities**

- SQL injection risks
- XSS (Cross-Site Scripting) vectors
- Authentication bypasses
- Secrets/credentials in code
- Insecure dependencies

⚡ **Performance Issues**

- N+1 database queries
- Inefficient algorithms (O(n²) → O(n log n))
- Memory leaks
- Blocking operations in async code
- Missing indexes

📝 **Code Quality**

- Best practice violations
- Code smells (long functions, deep nesting)
- Incomplete error handling
- Missing input validation
- Poor naming conventions

🐛 **Potential Bugs**

- Null/undefined pointer exceptions
- Race conditions
- Off-by-one errors
- Logic flaws
- Type mismatches

### How It Works

```
1. Developer opens/updates PR
    ↓
2. OpenCodeHub sends diff to AI
    ↓
3. AI analyzes code changes
    ↓
4. AI posts inline comments + summary
    ↓
5. Developer addresses feedback
```

**Privacy note:** Code is sent to AI provider (OpenAI/Anthropic). Use on-premise models for sensitive code.

---

## Setup

### Configure AI Provider

**Option 1: OpenAI (GPT-4)**

1. Get API key from [platform.openai.com](https://platform.openai.com/api-keys)

2. Add to `.env`:

   ```env
   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
   OPENAI_MODEL=gpt-4-turbo-preview  # or gpt-4, gpt-3.5-turbo
   ```

3. Restart OpenCodeHub

**Option 2: Anthropic (Claude)**

1. Get API key from [console.anthropic.com](https://console.anthropic.com/)

2. Add to `.env`:

   ```env
   AI_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
   ANTHROPIC_MODEL=claude-3-opus-20240229  # or claude-3-sonnet
   ```

3. Restart OpenCodeHub

**Option 3: Azure OpenAI**

```env
AI_PROVIDER=azure-openai
AZURE_OPENAI_API_KEY=xxxxx
AZURE_OPENAI_ENDPOINT=https://yourinstance.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
```

**Option 4: Self-Hosted (Coming Soon)**

OpenCodeHub will support local models via Ollama:

```env
AI_PROVIDER=ollama
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=codellama:13b
```

### Enable for Repository

**Via Web UI:**

1. Navigate to **Repository → Settings → AI Review**
2. Toggle **"Enable AI Code Review"**
3. Configure settings:
   - **Trigger**: `On PR open`, `On push`, or `Manual only`
   - **Auto-comment**: Post comments automatically
   - **Severity threshold**: `All`, `Warning+`, or `Critical only`
   - **Max files**: Limit review to N files (cost control)
4. Click **Save**

**Via API:**

```bash
curl -X PATCH https://git.yourcompany.com/api/repos/123/ai-review \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "enabled": true,
    "trigger": "on_pr_open",
    "auto_comment": true,
    "severity_threshold": "warning"
  }'
```

**Via CLI:**

```bash
och repo config ai-review --enable \
  --trigger on_pr_open \
  --auto-comment
```

---

## Using AI Review

### Automatic Reviews

If enabled, AI reviews trigger automatically:

```bash
# 1. Create PR
git push origin feature-branch
# → AI review starts automatically

# 2. Update PR
git push origin feature-branch
# → AI re-reviews changed files only
```

You'll see:

- ✅ **Status check**: "AI Review: In Progress" → "AI Review: Complete"
- 💬 **Inline comments**: On specific lines with issues
- 📊 **Summary comment**: Overall assessment

### Manual Reviews

Request AI review on-demand:

**Via Web UI:**

1. Open PR page
2. Click **"Request AI Review"** button
3. Wait ~30-60 seconds
4. Review appears as comments

**Via CLI:**

```bash
# Review specific PR
och review ai 125

# Review with custom prompt
och review ai 125 --focus security

# Re-review after changes
och review ai 125 --force
```

**Via API:**

```bash
curl -X POST https://git.yourcompany.com/api/prs/125/ai-review \
  -H "Authorization: Bearer $TOKEN"
```

---

## Understanding Review Output

### Severity Levels

AI assigns severity to each finding:

| Severity        | Icon       | Meaning                                | Example                                   |
| --------------- | ---------- | -------------------------------------- | ----------------------------------------- |
| 🔴 **CRITICAL** | Must fix   | Security vulnerability, data loss risk | SQL injection, exposed API key            |
| 🟡 **WARNING**  | Should fix | Performance issue, bad practice        | N+1 query, missing error handling         |
| 🔵 **INFO**     | Consider   | Suggestion, refactoring opportunity    | Better variable name, code simplification |

### Example Review Comment

````markdown
🔴 CRITICAL: SQL Injection Vulnerability

**File:** `src/api/users.ts`
**Line:** 45

**Issue:**
User input is directly concatenated into SQL query without sanitization.

**Current Code:**

```typescript
const query = `SELECT * FROM users WHERE email = '${userEmail}'`;
```
````

**Risk:**
An attacker could inject malicious SQL:

```
userEmail = "' OR '1'='1"
→ Query becomes: SELECT * FROM users WHERE email = '' OR '1'='1'
→ Returns ALL users (authentication bypass)
```

**Fix:**
Use parameterized queries or ORM:

```typescript
const query = `SELECT * FROM users WHERE email = ?`;
const results = await db.query(query, [userEmail]);

// Or with ORM:
const user = await db.users.findOne({ email: userEmail });
```

**References:**

- [OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)
- [Node.js SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)

````

### Summary Comment

AI posts an overall summary:

```markdown
## 🤖 AI Code Review Summary

**Overall Assessment:** ⚠️ Needs Attention

### Statistics
- Files reviewed: 8
- Critical issues: 2
- Warnings: 5
- Info: 3

### Critical Issues
1. 🔴 SQL Injection in `src/api/users.ts:45`
2. 🔴 Hardcoded API key in `src/config.ts:12`

### Recommendations
1. Add input validation to all API endpoints
2. Move secrets to environment variables
3. Consider adding integration tests for auth flows

### Positive Notes
- ✅ Good error handling in payment service
- ✅ Well-structured database migrations
- ✅ Comprehensive TypeScript types

**Estimated fix time:** 2-3 hours
````

---

## Customizing Reviews

### Review Rules

Create `.opencodehub/ai-review.yml` in your repository:

```yaml
# AI Review Configuration

# Which files to review
include:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "lib/**/*.js"

# Which files to skip
exclude:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/generated/**"
  - "dist/**"

# Focus areas (weighted 1-10)
focus:
  security: 10 # Highest priority
  performance: 8
  bugs: 8
  code_quality: 5
  documentation: 3

# Severity thresholds
report:
  critical: always
  warning: always
  info: on_request # Only if --verbose flag used

# Custom rules
custom_rules:
  - name: "No console.log in production"
    pattern: 'console\\.log\\('
    severity: warning
    message: "Remove console.log before merging"

  - name: "Require error handling"
    pattern: 'await.*\\(.*\\)'
    check: must_have_try_catch
    severity: warning

# AI instructions
instructions: >
  Pay special attention to:
  1. Authentication and authorization logic
  2. Database query efficiency
  3. Input validation
  4. Proper error handling

  Our coding standards:
  - TypeScript strict mode
  - Functional programming preferred
  - Maximum function length: 50 lines
  - Maximum cyclomatic complexity: 10
```

### Custom Prompts

**Focus on specific aspects:**

```bash
# Security-focused review
och review ai 125 --focus security

# Performance-focused review
och review ai 125 --focus performance

# Architecture review
och review ai 125 --prompt "Review system architecture and design patterns"
```

### Language-Specific Reviews

AI automatically adapts to programming language:

- **TypeScript/JavaScript**: Type safety, async/await, React best practices
- **Python**: PEP 8, type hints, Django/Flask patterns
- **Go**: Go idioms, error handling, concurrency
- **Rust**: Borrow checker, unsafe code, idiomatic Rust
- **Java**: Design patterns, Spring best practices, thread safety

---

## Cost Considerations

### Pricing

AI review costs depend on provider and model:

**OpenAI (GPT-4 Turbo):**

- ~$0.01 per 1K tokens (input)
- ~$0.03 per 1K tokens (output)
- **Typical PR**: 500-2000 tokens = **$0.02-0.10 per review**

**Anthropic (Claude 3 Opus):**

- ~$0.015 per 1K tokens (input)
- ~$0.075 per 1K tokens (output)
- **Typical PR**: **$0.03-0.15 per review**

**Example monthly cost:**

- 50 PRs/month × $0.05/review = **$2.50/month**
- 500 PRs/month × $0.05/review = **$25/month**

### Cost Optimization

**1. Limit file count:**

```yaml
max_files_per_review: 10 # Review only 10 largest changed files
```

**2. Use cheaper models for simple changes:**

```yaml
rules:
  - if: changed_files < 3
    model: gpt-3.5-turbo # 10x cheaper
  - if: changed_files >= 3
    model: gpt-4-turbo
```

**3. Skip test files:**

```yaml
exclude:
  - "**/*.test.*"
  - "**/*.spec.*"
```

**4. Review only on-request:**

```yaml
trigger: manual # Don't auto-review every push
```

**5. Use severity threshold:**

```yaml
severity_threshold: warning # Skip "info" level comments
```

---

## Best Practices

### 💡 When to Use AI Review

**✅ Good Use Cases:**

- Security-sensitive code (auth, payments)
- Complex algorithms
- Database queries
- API endpoints
- Third-party integrations

**❌ Less Useful:**

- Generated code
- Configuration files
- Simple refactoring
- Documentation-only changes

### 💡 Responding to AI Feedback

**1. Don't auto-fix everything**

- AI can be wrong
- Context matters
- Use judgment

**2. Engage in discussion**

```markdown
@ai-review That's a good catch, but in this case we're using a
trusted source and the data is already sanitized earlier in the pipeline.

See line 23 where we validate input.
```

**3. Track false positives**

```yaml
# .opencodehub/ai-review.yml
ignore:
  - file: src/utils/legacy.ts
    reason: "Legacy code, requires major refactor"
    until: 2024-12-31
```

### 💡 Combining with Human Review

AI complements, doesn't replace humans:

```
1. AI reviews first (catches obvious issues)
2. Developer fixes critical/warnings
3. Human reviewer approves
```

This workflow:

- Reduces human reviewer burden
- Catches more bugs
- Faster feedback cycles

---

## Troubleshooting

### "AI review taking too long"

**Cause:** Large PR (many files/lines).

**Solution:**

```bash
# Check review status
och review status 125

# Cancel and retry
och review cancel 125
och review ai 125 --max-files 5
```

### "AI review failed"

**Causes:**

1. API key invalid/expired
2. Rate limit exceeded
3. Timeout (very large PR)

**Solutions:**

```bash
# 1. Verify API key
echo $OPENAI_API_KEY

# 2. Check rate limits
curl https://api.openai.com/v1/usage \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# 3. Split large PR or review manually:
och review ai 125 --files src/api/users.ts src/api/auth.ts
```

### "Too many false positives"

**Solution:** Tune detection thresholds:

```yaml
# .opencodehub/ai-review.yml
sensitivity:
  security: high # Strict
  performance: medium
  code_quality: low # Lenient
```

### "Missing obvious bugs"

**Cause:** AI missed context or edge case.

**Solution:** Add custom instructions:

```yaml
instructions: >
  Our codebase uses a custom ORM. When reviewing database code:
  1. `db.raw()` is already parameterized
  2. All user input goes through `sanitize()` middleware
  3. Check for missing `await` on async functions
```

---

## Advanced: CI/CD Integration

### Block merge on critical findings

```yaml
# .github/workflows/ai-review.yml
name: AI Code Review
on: [pull_request]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - name: Run AI Review
        run: och review ai ${{ github.event.pull_request.number }}
        env:
          OCH_TOKEN: ${{ secrets.OCH_TOKEN }}

      - name: Check for critical issues
        run: |
          CRITICAL=$(och review status ${{ github.event.pull_request.number }} --json | jq '.critical_count')
          if [ "$CRITICAL" -gt 0 ]; then
            echo "❌ Critical issues found"
            exit 1
          fi
```

---

## See Also

- [Stacked Pull Requests](stacked-prs.md)
- [Smart Merge Queue](merge-queue.md)
- [CI/CD Integration](ci-cd.md)

---

## Need Help?

- 💬 [Discord Community](https://discord.gg/opencodehub)
- 🐛 [Report Issues](https://github.com/swadhinbiswas/OpencodeHub/issues)
- 📖 [Full Documentation](/)
