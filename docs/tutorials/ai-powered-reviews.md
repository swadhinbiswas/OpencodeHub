# Tutorial: AI-Powered Code Reviews

OpenCodeHub integrates with LLMs (GPT-4, Claude) to provide automated, intelligent code reviews on every Pull Request. This tutorial guides you through setting it up.

## Prerequisites

- An OpenCodeHub instance running v1.0.0+.
- An API Key from **OpenAI** or **Anthropic**.

## Step 1: Configure Provider

As an administrator, you need to configure the AI provider in your environment variables.

**For OpenAI:**
```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-...
```

**For Anthropic:**
```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Restart your OpenCodeHub instance to apply changes.

## Step 2: Enable for Repository

By default, AI review is opt-in per repository to save costs.

1. Navigate to **Repository Settings** > **AI Review**.
2. Toggle **Enable AI Review**.
3. Select **Triggers**:
   - [x] **On PR Open**: Reviews the initial code.
   - [ ] **On Every Push**: Reviews every update (Can be expensive).
   - [x] **Manual Only**: Developers must click "Request AI Review".

## Step 3: Seeing it in Action

1. Create a Pull Request with some code.
2. If configured for "Manual Only", look for the **"🤖 Request AI Review"** button in the PR sidebar. Click it.
3. Wait a few seconds (or minutes for large PRs).
4. The AI will comment directly on lines of code with:
   - 🔴 **Security Risks**: SQL injection, hardcoded secrets.
   - 🟡 **Bugs**: Null pointer exceptions, logic errors.
   - 🔵 **Suggestions**: Code style, minor performance tweaks.

## Tuning Prompts (Advanced)

You can customize the system prompt used for reviews by editing `src/lib/ai/prompts.ts` if you are self-hosting and want to enforce specific coding standards.
