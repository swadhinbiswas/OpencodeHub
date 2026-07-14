---
title: "AI Code Review"
---

AI Code Review uses advanced language models to automatically review your pull requests, catching bugs, security issues, and code quality problems before they reach production.

## Supported Providers

OpenCodeHub supports 10+ AI providers. Configure one or more in your `.env` file:

| Provider | Models | API Key Env Var |
|----------|--------|-----------------|
| **OpenAI** | GPT-4, GPT-4o, GPT-4 Turbo | `OPENAI_API_KEY` |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus | `ANTHROPIC_API_KEY` |
| **Google** | Gemini 1.5 Pro, Gemini Flash | `GOOGLE_AI_API_KEY` |
| **Groq** | Llama 3, Mixtral (fast inference) | `GROQ_API_KEY` |
| **OpenRouter** | Multi-model gateway | `OPENROUTER_API_KEY` |
| **Together** | Llama, Mixtral, CodeLlama | `TOGETHER_API_KEY` |
| **Bytez** | Various models | `BYTEZ_API_KEY` |
| **Ollama** | Any local model (Llama, CodeLlama, etc.) | No key needed |
| **External Agent** | Custom webhook | `EXTERNAL_AGENT_WEBHOOK_URL` |

:::tip[Recommended]
For best results, use **GPT-4o** or **Claude 3.5 Sonnet**. For fast/cheap reviews, use **Groq** or **Ollama** with a local model.
:::

## What AI Review Catches

**Security Vulnerabilities**
- SQL injection, XSS, CSRF
- Authentication/authorization bypasses
- Exposed secrets or credentials
- Insecure dependencies

**Performance Issues**
- N+1 database queries
- Inefficient algorithms
- Memory leaks
- Missing indexes

**Code Quality**
- Best practice violations
- Code smells (long functions, deep nesting)
- Incomplete error handling
- Missing input validation

**Potential Bugs**
- Null/undefined pointer exceptions
- Race conditions
- Off-by-one errors
- Type mismatches

## How It Works

```
1. Developer opens/updates PR
    ↓
2. OpenCodeHub sends diff to AI provider
    ↓
3. AI analyzes code changes
    ↓
4. AI posts inline comments + summary
    ↓
5. Developer addresses feedback
```

**Privacy note:** Code is sent to the configured AI provider. Use Ollama or the external agent for sensitive codebases.

## Setup

### Step 1: Configure AI Provider

**OpenAI:**
```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```

**Anthropic:**
```bash
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

**Google Gemini:**
```bash
GOOGLE_AI_API_KEY=xxxxxxxxxxxxx
```

**Groq (fast, cheap):**
```bash
GROQ_API_KEY=gsk_xxxxxxxxxxxxx
```

**Ollama (local, private):**
```bash
# No env var needed — configure in Settings → AI
# Just install Ollama: https://ollama.com
# Pull a model: ollama pull codellama:13b
```

**Multiple providers:** Configure all keys. The system picks the best available provider.

### Step 2: Enable for Repository

**Via Web UI:**
1. Go to **Repository → Settings → AI Review**
2. Toggle **Enable AI Code Review**
3. Configure trigger, severity threshold, and max files
4. Click **Save**

**Via API:**
```bash
curl -X PATCH https://git.yourcompany.com/api/repos/OWNER/REPO/settings \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "aiReview": { "enabled": true } }'
```

**Via CLI:**
```bash
och repo config ai-review --enable
```

## Using AI Review

### Automatic Reviews

When enabled, AI reviews trigger automatically when PRs are opened or updated.

### Manual Reviews

**Web UI:** Open PR page → Click "Request AI Review"

**CLI:**
```bash
och review ai <pr-number>
```

**API:**
```bash
curl -X POST https://git.yourcompany.com/api/repos/OWNER/REPO/pulls/125/ai-review \
  -H "Authorization: Bearer $TOKEN"
```

## Understanding Review Output

### Severity Levels

| Severity | Meaning | Example |
|----------|---------|---------|
| **CRITICAL** | Must fix — security/data loss | SQL injection, exposed key |
| **WARNING** | Should fix — perf/best practice | N+1 query, missing error handling |
| **INFO** | Consider — suggestion | Better variable name |

### Summary Comment

AI posts an overall summary with statistics, critical issues, and recommendations.

### Custom Rules

Create `.opencodehub/ai-review.yml` in your repo:

```yaml
include:
  - "src/**/*.ts"
exclude:
  - "**/*.test.ts"
  - "dist/**"

focus:
  security: 10
  performance: 8
  bugs: 8
  code_quality: 5

custom_rules:
  - name: "No console.log in production"
    pattern: 'console\.log\('
    severity: warning
    message: "Remove console.log before merging"
```

Or use **Settings → AI Review Rules** in the web UI.

## Cost Considerations

| Provider | Approx Cost per Review |
|----------|----------------------|
| Groq | Free (rate limited) |
| Ollama | Free (local) |
| OpenAI GPT-4o | ~$0.02-0.10 |
| Anthropic Claude | ~$0.03-0.15 |
| Google Gemini | ~$0.01-0.05 |

**Cost optimization:**
- Keep PRs small and focused
- Skip test files in review config
- Use severity threshold to filter info-level comments
- Use Groq or Ollama for routine reviews, GPT-4/Claude for critical code

## Troubleshooting

**AI review taking too long:** Large PR (many files). Split into smaller PRs.

**AI review failed:** Check API key is valid. Verify provider is configured in Settings → AI.

**Too many false positives:** Refine rules in Settings → AI Review Rules. Add custom instructions.

**Missing obvious bugs:** Add custom instructions describing your conventions and patterns.

## See Also

- [Stacked PRs](/features/stacked-prs/)
- [Merge Queue](/features/merge-queue/)
- [CI/CD Actions](/features/ci-actions/)
- [Configuration Reference](/administration/configuration/#ai-providers)
